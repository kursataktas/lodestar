import {
  CachedBeaconStateAllForks,
  RootCache,
  computeEpochAtSlot,
  isStateValidatorsNodesPopulated,
} from "@lodestar/state-transition";
import {Slot, bellatrix, ssz} from "@lodestar/types";
import {ForkName, MAX_SEED_LOOKAHEAD} from "@lodestar/params";
import {toHexString} from "@chainsafe/ssz";
import {ForkChoiceError, ForkChoiceErrorCode, ProtoBlock} from "@lodestar/fork-choice";
import {ChainForkConfig} from "@lodestar/config";
import {Logger} from "@lodestar/utils";
import {routes} from "@lodestar/api";
import {BlockError, BlockErrorCode} from "../errors/index.js";
import {BlockProcessOpts} from "../options.js";
import {RegenCaller} from "../regen/index.js";
import type {BeaconChain} from "../chain.js";
import {AttestationImportOpt, BlockInput, ImportBlockOpts} from "./types.js";
import {POS_PANDA_MERGE_TRANSITION_BANNER} from "./utils/pandaMergeTransitionBanner.js";
import {CAPELLA_OWL_BANNER} from "./utils/ownBanner.js";
import {verifyBlocksStateTransitionOnly} from "./verifyBlocksStateTransitionOnly.js";
import {verifyBlocksSignatures} from "./verifyBlocksSignatures.js";
import {verifyBlocksExecutionPayload, SegmentExecStatus} from "./verifyBlocksExecutionPayloads.js";

/**
 * Fork-choice allows to import attestations from current (0) or past (1) epoch.
 */
const FORK_CHOICE_ATT_EPOCH_LIMIT = 1;

/**
 * Verifies 1 or more blocks are fully valid; from a linear sequence of blocks.
 *
 * To relieve the main thread signatures are verified separately in workers with chain.bls worker pool.
 * In parallel it:
 * - Run full state transition in sequence
 * - Verify all block's signatures in parallel
 * - Submit execution payloads to EL in sequence
 *
 * If there's an error during one of the steps, the rest are aborted with an AbortController.
 */
export async function verifyBlocksInEpoch(
  this: BeaconChain,
  parentBlock: ProtoBlock,
  parentSlots: Slot[],
  blocksInput: BlockInput[],
  opts: BlockProcessOpts & ImportBlockOpts
): Promise<{
  postStates: CachedBeaconStateAllForks[];
  proposerBalanceDeltas: number[];
  segmentExecStatus: SegmentExecStatus;
}> {
  const blocks = blocksInput.map(({block}) => block);
  if (blocks.length === 0) {
    throw Error("Empty partiallyVerifiedBlocks");
  }

  const block0 = blocks[0];
  const block0Epoch = computeEpochAtSlot(block0.message.slot);

  // Ensure all blocks are in the same epoch
  for (let i = 1; i < blocks.length; i++) {
    const blockSlot = blocks[i].message.slot;
    if (block0Epoch !== computeEpochAtSlot(blockSlot)) {
      throw Error(`Block ${i} slot ${blockSlot} not in same epoch ${block0Epoch}`);
    }
  }

  // TODO: Skip in process chain segment
  // Retrieve preState from cache (regen)
  const preState0 = await this.regen
    .getPreState(block0.message, {dontTransferCache: false}, RegenCaller.processBlocksInEpoch)
    .catch((e) => {
      throw new BlockError(block0, {code: BlockErrorCode.PRESTATE_MISSING, error: e as Error});
    });

  if (!isStateValidatorsNodesPopulated(preState0)) {
    this.logger.verbose("verifyBlocksInEpoch preState0 SSZ cache stats", {
      cache: isStateValidatorsNodesPopulated(preState0),
      clonedCount: preState0.clonedCount,
      clonedCountWithTransferCache: preState0.clonedCountWithTransferCache,
      createdWithTransferCache: preState0.createdWithTransferCache,
    });
  }

  // Ensure the state is in the same epoch as block0
  if (block0Epoch !== computeEpochAtSlot(preState0.slot)) {
    throw Error(`preState at slot ${preState0.slot} must be dialed to block epoch ${block0Epoch}`);
  }

  const abortController = new AbortController();

  try {
    // Execution payloads
    const executionPromise = verifyBlocksExecutionPayload(
      this,
      parentBlock,
      blocks,
      preState0,
      abortController.signal,
      opts
    );
    const [{postStates, proposerBalanceDeltas}] = await Promise.all([
      // verifyBlocksExecutionPayload(this, parentBlock, blocks, preState0, abortController.signal, opts),
      // Run state transition only
      // TODO: Ensure it yields to allow flushing to workers and engine API
      verifyBlocksStateTransitionOnly(preState0, blocksInput, this.logger, this.metrics, abortController.signal, opts),

      // All signatures at once
      verifyBlocksSignatures(this.bls, this.logger, this.metrics, preState0, blocks, opts),
    ]);

    // verifyBlocksStateTransitionOnly + verifyBlocksSignatures usually take 200ms - 250ms less than verifyBlocksExecutionPayload
    // we leverage this time to precompute forkchoice's deltas and do some early import after we verify blocks' signatures
    const currentEpoch = this.clock.currentEpoch;
    for (const [i, {block}] of blocksInput.entries()) {
      const blockEpoch = computeEpochAtSlot(block.message.slot);
      const parentBlockSlot = parentSlots[i];
      const postState = postStates[i];

      // Import attestations to fork choice
      //
      // - For each attestation
      //   - Get indexed attestation
      //   - Register attestation with fork-choice
      //   - Register attestation with validator monitor (only after sync)
      // Only process attestations of blocks with relevant attestations for the fork-choice:
      // If current epoch is N, and block is epoch X, block may include attestations for epoch X or X - 1.
      // The latest block that is useful is at epoch N - 1 which may include attestations for epoch N - 1 or N - 2.
      if (
        opts.importAttestations === AttestationImportOpt.Force ||
        (opts.importAttestations !== AttestationImportOpt.Skip &&
          blockEpoch >= currentEpoch - FORK_CHOICE_ATT_EPOCH_LIMIT)
      ) {
        const attestations = block.message.body.attestations;
        const rootCache = new RootCache(postState);
        const invalidAttestationErrorsByCode = new Map<string, {error: Error; count: number}>();

        for (const attestation of attestations) {
          try {
            const indexedAttestation = postState.epochCtx.getIndexedAttestation(attestation);
            const {target, slot, beaconBlockRoot} = attestation.data;

            const attDataRoot = toHexString(ssz.phase0.AttestationData.hashTreeRoot(indexedAttestation.data));
            this.seenAggregatedAttestations.add(
              target.epoch,
              attDataRoot,
              {aggregationBits: attestation.aggregationBits, trueBitCount: indexedAttestation.attestingIndices.length},
              true
            );
            // Duplicated logic from fork-choice onAttestation validation logic.
            // Attestations outside of this range will be dropped as Errors, so no need to import
            if (
              opts.importAttestations === AttestationImportOpt.Force ||
              (target.epoch <= currentEpoch && target.epoch >= currentEpoch - FORK_CHOICE_ATT_EPOCH_LIMIT)
            ) {
              this.forkChoice.onAttestation(
                indexedAttestation,
                attDataRoot,
                opts.importAttestations === AttestationImportOpt.Force
              );
            }

            // Note: To avoid slowing down sync, only register attestations within FORK_CHOICE_ATT_EPOCH_LIMIT
            this.seenBlockAttesters.addIndices(blockEpoch, indexedAttestation.attestingIndices);

            const correctHead = ssz.Root.equals(rootCache.getBlockRootAtSlot(slot), beaconBlockRoot);
            this.metrics?.registerAttestationInBlock(indexedAttestation, parentBlockSlot, correctHead);

            // don't want to log the processed attestations here as there are so many attestations and it takes too much disc space,
            // users may want to keep more log files instead of unnecessary processed attestations log
            // see https://github.com/ChainSafe/lodestar/pull/4032
            this.emitter.emit(routes.events.EventType.attestation, attestation);
          } catch (e) {
            // a block has a lot of attestations and it may has same error, we don't want to log all of them
            if (e instanceof ForkChoiceError && e.type.code === ForkChoiceErrorCode.INVALID_ATTESTATION) {
              let errWithCount = invalidAttestationErrorsByCode.get(e.type.err.code);
              if (errWithCount === undefined) {
                errWithCount = {error: e as Error, count: 1};
                invalidAttestationErrorsByCode.set(e.type.err.code, errWithCount);
              } else {
                errWithCount.count++;
              }
            } else {
              // always log other errors
              this.logger.verbose("Error processing attestation from block", {slot: block.message.slot}, e as Error);
            }
          }
        }

        for (const {error, count} of invalidAttestationErrorsByCode.values()) {
          this.logger.verbose(
            "Error processing attestations from block",
            {slot: block.message.slot, erroredAttestations: count},
            error
          );
        }
      }

      // Import attester slashings to fork choice
      //
      // FORK_CHOICE_ATT_EPOCH_LIMIT is for attestation to become valid
      // but AttesterSlashing could be found before that time and still able to submit valid attestations
      // until slashed validator become inactive, see computeActivationExitEpoch() function
      if (
        opts.importAttestations === AttestationImportOpt.Force ||
        (opts.importAttestations !== AttestationImportOpt.Skip &&
          blockEpoch >= currentEpoch - FORK_CHOICE_ATT_EPOCH_LIMIT - 1 - MAX_SEED_LOOKAHEAD)
      ) {
        for (const slashing of block.message.body.attesterSlashings) {
          try {
            // all AttesterSlashings are valid before reaching this
            this.forkChoice.onAttesterSlashing(slashing);
          } catch (e) {
            this.logger.warn("Error processing AttesterSlashing from block", {slot: block.message.slot}, e as Error);
          }
        }
      }
    }

    // it does not make sense to call prepareUpdateHead() for all blocks
    // forkchoice will only prepare update head if block slot is same to clock slot
    this.forkChoice.prepareUpdateHead(blocks[blocks.length - 1].message);
    const segmentExecStatus = await executionPromise;
    if (segmentExecStatus.execAborted === null && segmentExecStatus.mergeBlockFound !== null) {
      // merge block found and is fully valid = state transition + signatures + execution payload.
      // TODO: Will this banner be logged during syncing?
      logOnPowBlock(this.logger, this.config, segmentExecStatus.mergeBlockFound);
    }

    const fromFork = this.config.getForkName(parentBlock.slot);
    const toFork = this.config.getForkName(blocks[blocks.length - 1].message.slot);

    // If transition through capella, note won't happen if CAPELLA_EPOCH = 0, will log double on re-org
    if (fromFork !== ForkName.capella && toFork === ForkName.capella) {
      this.logger.info(CAPELLA_OWL_BANNER);
      this.logger.info("Activating withdrawals", {epoch: this.config.CAPELLA_FORK_EPOCH});
    }

    return {postStates, proposerBalanceDeltas, segmentExecStatus};
  } finally {
    abortController.abort();
  }
}

function logOnPowBlock(logger: Logger, config: ChainForkConfig, mergeBlock: bellatrix.BeaconBlock): void {
  const mergeBlockHash = toHexString(config.getForkTypes(mergeBlock.slot).BeaconBlock.hashTreeRoot(mergeBlock));
  const mergeExecutionHash = toHexString(mergeBlock.body.executionPayload.blockHash);
  const mergePowHash = toHexString(mergeBlock.body.executionPayload.parentHash);
  logger.info(POS_PANDA_MERGE_TRANSITION_BANNER);
  logger.info("Execution transitioning from PoW to PoS!!!");
  logger.info("Importing block referencing terminal PoW block", {
    blockHash: mergeBlockHash,
    executionHash: mergeExecutionHash,
    powHash: mergePowHash,
  });
}
