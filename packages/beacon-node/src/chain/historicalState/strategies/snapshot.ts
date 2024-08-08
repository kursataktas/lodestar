import {RootHex, Slot} from "@lodestar/types";
import {Logger} from "@lodestar/logger";
import {computeEpochAtSlot} from "@lodestar/state-transition";
import {HistoricalStateRegenMetrics, StateArchiveStrategy} from "../types.js";
import {IBeaconDb} from "../../../db/interface.js";
import {IStateRegenerator, RegenCaller} from "../../regen/interface.js";
import {validateStateArchiveStrategy} from "../utils/strategies.js";

export async function putState(
  {slot, blockRoot}: {slot: Slot; blockRoot: RootHex},
  {
    regen,
    db,
    logger,
    metrics,
  }: {regen: IStateRegenerator; db: IBeaconDb; logger: Logger; metrics?: HistoricalStateRegenMetrics}
): Promise<void> {
  validateStateArchiveStrategy(slot, StateArchiveStrategy.Snapshot);

  const state = await regen.getBlockSlotState(blockRoot, slot, {dontTransferCache: false}, RegenCaller.historicalState);
  const serialized = state.serialize();

  metrics?.stateSnapshotSize.set(serialized.byteLength);

  await db.stateArchive.putBinary(slot, serialized);
  logger.verbose("State stored as snapshot", {
    epoch: computeEpochAtSlot(slot),
    slot,
    blockRoot,
  });
}

export async function getState(
  {slot}: {slot: Slot},
  {db, metrics}: {db: IBeaconDb; metrics?: HistoricalStateRegenMetrics}
): Promise<Uint8Array | null> {
  const loadStateTimer = metrics?.loadStateTime.startTimer();
  await db.stateArchive.getBinary(slot);
  loadStateTimer?.();
  return null;
}
