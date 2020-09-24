import PeerId from "peer-id";
import {AbortController, AbortSignal} from "abort-controller";
import {source as abortSource} from "abortable-iterator";
import {IRegularSync, IRegularSyncModules, RegularSyncEventEmitter} from "../interface";
import {getSyncProtocols, INetwork} from "../../../network";
import {IBeaconChain} from "../../../chain";
import {defaultOptions, IRegularSyncOptions} from "../options";
import deepmerge from "deepmerge";
import {ILogger} from "@chainsafe/lodestar-utils/lib/logger";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {SignedBeaconBlock, Slot, Root} from "@chainsafe/lodestar-types";
import {sleep} from "@chainsafe/lodestar-utils";
import pushable, {Pushable} from "it-pushable";
import pipe from "it-pipe";
import {ISlotRange, ISyncCheckpoint} from "../../interface";
import {fetchBlockChunks, processSyncBlocks, getBestPeer, checkBestPeer} from "../../utils";
import {GossipEvent} from "../../../network/gossip/constants";
import {toHexString} from "@chainsafe/ssz";
import {EventEmitter} from "events";

export class NaiveRegularSync extends (EventEmitter as {new (): RegularSyncEventEmitter}) implements IRegularSync {
  private readonly config: IBeaconConfig;

  private readonly network: INetwork;

  private readonly chain: IBeaconChain;

  private readonly logger: ILogger;

  private readonly opts: IRegularSyncOptions;

  private bestPeer: PeerId | undefined;

  private currentTarget: Slot = 0;
  private targetSlotRangeSource: Pushable<ISlotRange>;
  private gossipParentBlockRoot: Root | undefined;
  // only subscribe to gossip when we're up to this
  private controller!: AbortController;
  /**
   * The last processed block
   */
  private lastProcessedBlock!: ISyncCheckpoint;

  constructor(options: Partial<IRegularSyncOptions>, modules: IRegularSyncModules) {
    super();
    this.config = modules.config;
    this.network = modules.network;
    this.chain = modules.chain;
    this.logger = modules.logger;
    this.opts = deepmerge(defaultOptions, options);
    this.targetSlotRangeSource = pushable<ISlotRange>();
  }

  public async start(): Promise<void> {
    const headSlot = this.chain.forkChoice.getHead().slot;
    const currentSlot = this.chain.clock.currentSlot;
    this.logger.info("Started regular syncing", {currentSlot, headSlot});
    if (headSlot >= currentSlot) {
      this.logger.info(`Regular Sync: node is up to date, headSlot=${headSlot}`);
      this.emit("syncCompleted");
      await this.stop();
      return;
    }
    this.currentTarget = headSlot;
    this.lastProcessedBlock = this.chain.forkChoice.getHead();
    this.logger.verbose(`Regular Sync: Current slot at start: ${currentSlot}`);
    this.targetSlotRangeSource = pushable<ISlotRange>();
    this.controller = new AbortController();
    await this.waitForBestPeer(this.controller.signal);
    const newTarget = this.getNewTarget();
    this.logger.info("Regular Sync: Setting target", {newTargetSlot: newTarget});
    this.network.gossip.subscribeToBlock(this.chain.currentForkDigest, this.onGossipBlock);
    // to avoid listening for "block" event from initial sync, only listen for "block" event of regular sync from here
    this.chain.emitter.on("block", this.onProcessedBlock);
    await Promise.all([this.sync(), this.setTarget()]);
  }

  public async stop(): Promise<void> {
    this.targetSlotRangeSource.end();
    if (this.controller) {
      this.controller.abort();
    }
    this.chain.emitter.removeListener("block", this.onProcessedBlock);
    this.network.gossip.unsubscribe(this.chain.currentForkDigest, GossipEvent.BLOCK, this.onGossipBlock);
  }

  public getHighestBlock(): Slot {
    return this.currentTarget;
  }

  private getNewTarget(): Slot {
    const currentSlot = this.chain.clock.currentSlot;
    // due to exclusive endSlot in chunkify, we want `currentSlot + 1`
    return Math.min(this.currentTarget + this.opts.blockPerChunk, currentSlot + 1);
  }

  private setTarget = (newTarget?: Slot, triggerSync = true): void => {
    newTarget = newTarget ?? this.getNewTarget();
    if (triggerSync && newTarget > this.currentTarget) {
      this.logger.info(`Regular Sync: Requesting blocks from slot ${this.currentTarget + 1} to slot ${newTarget}`);
      this.targetSlotRangeSource.push({start: this.currentTarget + 1, end: newTarget});
    }
    this.currentTarget = newTarget;
  };

  private onProcessedBlock = async (lastProcessedBlock: SignedBeaconBlock): Promise<void> => {
    if (this.currentTarget <= lastProcessedBlock.message.slot) {
      if (await this.checkSyncComplete()) {
        return;
      }
      this.logger.info(
        `Regular Sync: Synced up to slot ${lastProcessedBlock.message.slot} ` +
          `gossipParentBlockRoot=${this.gossipParentBlockRoot && toHexString(this.gossipParentBlockRoot)}`
      );
      // don't want to trigger another sync from other sources than regular sync
      if (this.currentTarget === lastProcessedBlock.message.slot) {
        this.lastProcessedBlock = {
          slot: lastProcessedBlock.message.slot,
          blockRoot: this.config.types.BeaconBlock.hashTreeRoot(lastProcessedBlock.message),
        };
        this.setTarget();
      }
    }
  };

  private onGossipBlock = async (block: SignedBeaconBlock): Promise<void> => {
    this.gossipParentBlockRoot = block.message.parentRoot;
    this.logger.verbose(
      `Regular Sync: Set gossip parent block to ${toHexString(this.gossipParentBlockRoot)}` +
        `, gossip slot ${block.message.slot}`
    );
    await this.checkSyncComplete();
  };

  private checkSyncComplete = async (): Promise<boolean> => {
    if (this.gossipParentBlockRoot && this.chain.forkChoice.hasBlock(this.gossipParentBlockRoot as Uint8Array)) {
      this.logger.important(
        "Regular Sync: caught up to gossip block parent " + toHexString(this.gossipParentBlockRoot)
      );
      this.emit("syncCompleted");
      await this.stop();
      return true;
    }
    return false;
  };

  private async sync(): Promise<void> {
    const {config, logger, chain, controller} = this;
    const reqResp = this.network.reqResp;
    const {getSyncPeers, setTarget, handleEmptyRange, handleFailedToGetRange, getLastProcessedBlock} = this;
    await pipe(this.targetSlotRangeSource, (source) => {
      return (async function () {
        for await (const range of abortSource(source, controller.signal, {returnOnAbort: true})) {
          const lastFetchedSlot = await pipe(
            [range],
            fetchBlockChunks(logger, chain, reqResp, getSyncPeers, undefined, controller.signal),
            processSyncBlocks(config, chain, logger, false, getLastProcessedBlock())
          );
          if (lastFetchedSlot) {
            // failed to fetch range
            if (lastFetchedSlot === getLastProcessedBlock().slot) {
              handleFailedToGetRange(range);
            } else {
              // success, not trigger sync until after we process lastFetchedSlot
              setTarget(lastFetchedSlot, false);
            }
          } else {
            // no block, retry expanded range with same start slot
            await handleEmptyRange(range);
          }
        }
      })();
    });
  }

  private handleEmptyRange = async (range: ISlotRange): Promise<void> => {
    if (!this.bestPeer) {
      return;
    }
    const peerHeadSlot = this.network.peerMetadata.getStatus(this.bestPeer)?.headSlot ?? 0;
    this.logger.verbose(`Regular Sync: Not found any blocks for range ${JSON.stringify(range)}`);
    if (range.end <= peerHeadSlot) {
      // range contains skipped slots, query for next range
      this.logger.verbose(`Range ${JSON.stringify(range)} is behind peer head ${peerHeadSlot}, fetch next range`);
      this.setTarget();
    } else {
      this.logger.verbose(`Range ${JSON.stringify(range)} passed peer head ${peerHeadSlot}, sleep then try again`);
      // don't want to disturb our peer if we pass peer head
      await sleep(this.config.params.SECONDS_PER_SLOT * 1000);
      this.setTarget(range.start - 1, false);
      this.setTarget();
    }
  };

  private handleFailedToGetRange = (range: ISlotRange): void => {
    this.logger.warn(`Regular Sync: retrying range ${JSON.stringify(range)}`);
    // retry again
    this.setTarget(range.start - 1, false);
    this.setTarget();
  };

  /**
   * Make sure we get up-to-date lastProcessedBlock from sync().
   */
  private getLastProcessedBlock = (): ISyncCheckpoint => {
    return this.lastProcessedBlock;
  };

  /**
   * Make sure the best peer is not disconnected and it's better than us.
   */
  private getSyncPeers = async (): Promise<PeerId[]> => {
    if (!checkBestPeer(this.bestPeer!, this.chain.forkChoice, this.network)) {
      this.logger.info("Regular Sync: wait for best peer");
      await this.waitForBestPeer(this.controller.signal);
    }
    return [this.bestPeer!];
  };

  private waitForBestPeer = async (signal: AbortSignal): Promise<void> => {
    // statusSyncTimer is per slot
    const waitingTime = this.config.params.SECONDS_PER_SLOT * 1000;

    while (!this.bestPeer) {
      // wait first to make sure we have latest status
      await sleep(waitingTime, signal);
      const peers = this.network
        .getPeers({connected: true, supportsProtocols: getSyncProtocols()})
        .map((peer) => peer.id);
      this.bestPeer = getBestPeer(this.config, peers, this.network.peerMetadata);
      if (checkBestPeer(this.bestPeer, this.chain.forkChoice, this.network)) {
        const peerHeadSlot = this.network.peerMetadata.getStatus(this.bestPeer)!.headSlot;
        this.logger.verbose(`Found best peer ${this.bestPeer.toB58String()} with head slot ${peerHeadSlot}`);
      } else {
        // continue to find best peer
        this.bestPeer = undefined;
      }
    }
  };
}
