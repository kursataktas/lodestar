import {ChainForkConfig} from "@lodestar/config";
import {Db, Repository} from "@lodestar/db";
import {ssz, FullOrBlindedSignedBeaconBlock} from "@lodestar/types";
import {blindedOrFullBlockHashTreeRoot} from "@lodestar/state-transition";
import {
  deserializeFullOrBlindedSignedBeaconBlock,
  serializeFullOrBlindedSignedBeaconBlock,
} from "../../util/fullOrBlindedBlock.js";
import {getSignedBlockTypeFromBytes} from "../../util/multifork.js";
import {Bucket, getBucketNameByValue} from "../buckets.js";

/**
 * Blocks by root
 *
 * Used to store unfinalized blocks
 */
export class BlockRepository extends Repository<Uint8Array, FullOrBlindedSignedBeaconBlock> {
  constructor(config: ChainForkConfig, db: Db) {
    const bucket = Bucket.allForks_block;
    const type = ssz.phase0.SignedBeaconBlock; // Pick some type but won't be used
    super(config, db, bucket, type, getBucketNameByValue(bucket));
  }

  /**
   * Id is hashTreeRoot of unsigned BeaconBlock
   */
  getId(value: FullOrBlindedSignedBeaconBlock): Uint8Array {
    return blindedOrFullBlockHashTreeRoot(this.config, value.message);
  }

  encodeValue(value: FullOrBlindedSignedBeaconBlock): Buffer {
    return serializeFullOrBlindedSignedBeaconBlock(this.config, value) as Buffer;
  }

  decodeValue(data: Buffer): FullOrBlindedSignedBeaconBlock {
    return deserializeFullOrBlindedSignedBeaconBlock(this.config, data);
  }
}
