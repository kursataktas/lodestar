import {RootHex, Slot} from "@lodestar/types";
import {Logger} from "@lodestar/logger";
import {computeEpochAtSlot} from "@lodestar/state-transition";
import {StateArchiveStrategy} from "../types.js";
import {IBeaconDb} from "../../../db/interface.js";
import {IStateRegenerator, RegenCaller} from "../../regen/interface.js";
import {validateStateArchiveStrategy} from "../utils/strategies.js";
import {BinaryDiffCodec} from "../utils/binaryDiffCodec.js";

let codecInitialized: boolean = false;
const codec = new BinaryDiffCodec();

export async function putState(
  {
    slot,
    blockRoot,
    snapshotSlot,
    snapshotState,
  }: {slot: Slot; blockRoot: RootHex; snapshotState: Uint8Array; snapshotSlot: Slot},
  {regen, db, logger}: {regen: IStateRegenerator; db: IBeaconDb; logger: Logger}
): Promise<void> {
  validateStateArchiveStrategy(slot, StateArchiveStrategy.Diff);

  if (!codecInitialized) {
    await codec.init();
    codecInitialized = true;
  }
  const currentState = await regen.getBlockSlotState(
    blockRoot,
    slot,
    {dontTransferCache: false},
    RegenCaller.historicalState
  );

  const activeState = await replayStateDiffsTill({slot, snapshotSlot, snapshotState}, {db});
  const diff = codec.compute(currentState.serialize(), activeState);
  await db.stateArchive.putBinary(slot, diff);

  logger.verbose("State stored as diff", {
    epoch: computeEpochAtSlot(slot),
    slot,
    blockRoot,
  });
}

export async function getState(
  {slot, snapshotSlot, snapshotState}: {slot: Slot; snapshotState: Uint8Array; snapshotSlot: Slot},
  {db}: {db: IBeaconDb}
): Promise<Uint8Array | null> {
  return replayStateDiffsTill({slot, snapshotSlot, snapshotState}, {db});
}

async function replayStateDiffsTill(
  {slot, snapshotSlot, snapshotState}: {slot: Slot; snapshotState: Uint8Array; snapshotSlot: Slot},
  {db}: {db: IBeaconDb}
): Promise<Uint8Array> {
  const intermediateSlots = await db.stateArchive.keys({gt: snapshotSlot, lte: slot});
  const intermediateStatesDiffs = await Promise.all(intermediateSlots.map((s) => db.stateArchive.getBinary(s)));

  let activeState: Uint8Array = snapshotState;
  for (const intermediateStateDiff of intermediateStatesDiffs) {
    // TODO: Handle the case if any intermediate diff state is missing
    if (!intermediateStateDiff) continue;
    activeState = codec.apply(activeState, intermediateStateDiff);
  }

  return activeState;
}
