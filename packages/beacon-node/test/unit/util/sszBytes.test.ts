import {expect} from "chai";
import {config} from "@lodestar/config/default";
import {createChainForkConfig} from "@lodestar/config";
import {deneb, Epoch, phase0, RootHex, Slot, ssz} from "@lodestar/types";
import {fromHex, toHex} from "@lodestar/utils";
import {computeStartSlotAtEpoch} from "@lodestar/state-transition";
import {
  getAttDataBase64FromAttestationSerialized,
  getAttDataBase64FromSignedAggregateAndProofSerialized,
  getAggregationBitsFromAttestationSerialized as getAggregationBitsFromAttestationSerialized,
  getBlockRootFromAttestationSerialized,
  getBlockRootFromSignedAggregateAndProofSerialized,
  getSlotFromAttestationSerialized,
  getSlotFromSignedAggregateAndProofSerialized,
  getSignatureFromAttestationSerialized,
  getSlotFromSignedBeaconBlockSerialized,
  getSlotFromSignedBlobSidecarSerialized,
  getValidatorsBytesFromStateBytes,
  getWithdrawalCredentialFirstByteFromValidatorBytes,
} from "../../../src/util/sszBytes.js";
import {generateState} from "../../utils/state.js";

describe("attestation SSZ serialized picking", () => {
  const testCases: phase0.Attestation[] = [
    ssz.phase0.Attestation.defaultValue(),
    attestationFromValues(
      4_000_000,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      200_00,
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeffffffffffffffffffffffffffffffff"
    ),
  ];

  for (const [i, attestation] of testCases.entries()) {
    it(`attestation ${i}`, () => {
      const bytes = ssz.phase0.Attestation.serialize(attestation);

      expect(getSlotFromAttestationSerialized(bytes)).equals(attestation.data.slot);
      expect(getBlockRootFromAttestationSerialized(bytes)).equals(toHex(attestation.data.beaconBlockRoot));
      expect(getAggregationBitsFromAttestationSerialized(bytes)?.toBoolArray()).to.be.deep.equals(
        attestation.aggregationBits.toBoolArray()
      );
      expect(getSignatureFromAttestationSerialized(bytes)).to.be.deep.equals(attestation.signature);

      const attDataBase64 = ssz.phase0.AttestationData.serialize(attestation.data);
      expect(getAttDataBase64FromAttestationSerialized(bytes)).to.be.equal(
        Buffer.from(attDataBase64).toString("base64")
      );
    });
  }

  it("getSlotFromAttestationSerialized - invalid data", () => {
    const invalidSlotDataSizes = [0, 4, 11];
    for (const size of invalidSlotDataSizes) {
      expect(getSlotFromAttestationSerialized(Buffer.alloc(size))).to.be.null;
    }
  });

  it("getBlockRootFromAttestationSerialized - invalid data", () => {
    const invalidBlockRootDataSizes = [0, 4, 20, 49];
    for (const size of invalidBlockRootDataSizes) {
      expect(getBlockRootFromAttestationSerialized(Buffer.alloc(size))).to.be.null;
    }
  });

  it("getAttDataBase64FromAttestationSerialized - invalid data", () => {
    const invalidAttDataBase64DataSizes = [0, 4, 100, 128, 131];
    for (const size of invalidAttDataBase64DataSizes) {
      expect(getAttDataBase64FromAttestationSerialized(Buffer.alloc(size))).to.be.null;
    }
  });

  it("getAggregateionBitsFromAttestationSerialized - invalid data", () => {
    const invalidAggregationBitsDataSizes = [0, 4, 100, 128, 227];
    for (const size of invalidAggregationBitsDataSizes) {
      expect(getAggregationBitsFromAttestationSerialized(Buffer.alloc(size))).to.be.null;
    }
  });

  it("getSignatureFromAttestationSerialized - invalid data", () => {
    const invalidSignatureDataSizes = [0, 4, 100, 128, 227];
    for (const size of invalidSignatureDataSizes) {
      expect(getSignatureFromAttestationSerialized(Buffer.alloc(size))).to.be.null;
    }
  });
});

describe("aggregateAndProof SSZ serialized picking", () => {
  const testCases: phase0.SignedAggregateAndProof[] = [
    ssz.phase0.SignedAggregateAndProof.defaultValue(),
    signedAggregateAndProofFromValues(
      4_000_000,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      200_00,
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeffffffffffffffffffffffffffffffff"
    ),
  ];

  for (const [i, signedAggregateAndProof] of testCases.entries()) {
    it(`signedAggregateAndProof ${i}`, () => {
      const bytes = ssz.phase0.SignedAggregateAndProof.serialize(signedAggregateAndProof);

      expect(getSlotFromSignedAggregateAndProofSerialized(bytes)).equals(
        signedAggregateAndProof.message.aggregate.data.slot
      );
      expect(getBlockRootFromSignedAggregateAndProofSerialized(bytes)).equals(
        toHex(signedAggregateAndProof.message.aggregate.data.beaconBlockRoot)
      );

      const attDataBase64 = ssz.phase0.AttestationData.serialize(signedAggregateAndProof.message.aggregate.data);
      expect(getAttDataBase64FromSignedAggregateAndProofSerialized(bytes)).to.be.equal(
        Buffer.from(attDataBase64).toString("base64")
      );
    });
  }

  it("getSlotFromSignedAggregateAndProofSerialized - invalid data", () => {
    const invalidSlotDataSizes = [0, 4, 11];
    for (const size of invalidSlotDataSizes) {
      expect(getSlotFromSignedAggregateAndProofSerialized(Buffer.alloc(size))).to.be.null;
    }
  });

  it("getBlockRootFromSignedAggregateAndProofSerialized - invalid data", () => {
    const invalidBlockRootDataSizes = [0, 4, 20, 227];
    for (const size of invalidBlockRootDataSizes) {
      expect(getBlockRootFromSignedAggregateAndProofSerialized(Buffer.alloc(size))).to.be.null;
    }
  });

  it("getAttDataBase64FromSignedAggregateAndProofSerialized - invalid data", () => {
    const invalidAttDataBase64DataSizes = [0, 4, 100, 128, 339];
    for (const size of invalidAttDataBase64DataSizes) {
      expect(getAttDataBase64FromSignedAggregateAndProofSerialized(Buffer.alloc(size))).to.be.null;
    }
  });
});

describe("signedBeaconBlock SSZ serialized picking", () => {
  const testCases = [ssz.phase0.SignedBeaconBlock.defaultValue(), signedBeaconBlockFromValues(1_000_000)];

  for (const [i, signedBeaconBlock] of testCases.entries()) {
    const bytes = ssz.phase0.SignedBeaconBlock.serialize(signedBeaconBlock);
    it(`signedBeaconBlock ${i}`, () => {
      expect(getSlotFromSignedBeaconBlockSerialized(bytes)).equals(signedBeaconBlock.message.slot);
    });
  }

  it("getSlotFromSignedBeaconBlockSerialized - invalid data", () => {
    const invalidSlotDataSizes = [0, 50, 104];
    for (const size of invalidSlotDataSizes) {
      expect(getSlotFromSignedBeaconBlockSerialized(Buffer.alloc(size))).to.be.null;
    }
  });
});

describe("signedBlobSidecar SSZ serialized picking", () => {
  const testCases = [ssz.deneb.SignedBlobSidecar.defaultValue(), signedBlobSidecarFromValues(1_000_000)];

  for (const [i, signedBlobSidecar] of testCases.entries()) {
    const bytes = ssz.deneb.SignedBlobSidecar.serialize(signedBlobSidecar);
    it(`signedBlobSidecar ${i}`, () => {
      expect(getSlotFromSignedBlobSidecarSerialized(bytes)).equals(signedBlobSidecar.message.slot);
    });
  }

  it("signedBlobSidecar - invalid data", () => {
    const invalidSlotDataSizes = [0, 20, 38];
    for (const size of invalidSlotDataSizes) {
      expect(getSlotFromSignedBlobSidecarSerialized(Buffer.alloc(size))).to.be.null;
    }
  });
});

describe("validators bytes utils", () => {
  it("phase0", () => {
    const state = generateState({slot: 100}, config);
    expect(state.validators.length).to.be.equal(16);
    for (let i = 0; i < state.validators.length; i++) {
      state.validators.get(i).withdrawalCredentials = Buffer.alloc(32, i % 2);
    }
    state.commit();
    const validatorsBytes = state.validators.serialize();
    const stateBytes = state.serialize();
    expect(getValidatorsBytesFromStateBytes(config, stateBytes)).to.be.deep.equal(validatorsBytes);
    for (let i = 0; i < state.validators.length; i++) {
      expect(getWithdrawalCredentialFirstByteFromValidatorBytes(validatorsBytes, i)).to.be.equal(i % 2);
    }
  });

  it("altair", () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const altairConfig = createChainForkConfig({...config, ALTAIR_FORK_EPOCH: 100});
    const state = generateState({slot: computeStartSlotAtEpoch(altairConfig.ALTAIR_FORK_EPOCH) + 100}, altairConfig);
    expect(state.validators.length).to.be.equal(16);
    for (let i = 0; i < state.validators.length; i++) {
      state.validators.get(i).withdrawalCredentials = Buffer.alloc(32, i % 2);
    }
    state.commit();
    const validatorsBytes = state.validators.serialize();
    const stateBytes = state.serialize();
    expect(getValidatorsBytesFromStateBytes(altairConfig, stateBytes)).to.be.deep.equal(validatorsBytes);
    for (let i = 0; i < state.validators.length; i++) {
      expect(getWithdrawalCredentialFirstByteFromValidatorBytes(validatorsBytes, i)).to.be.equal(i % 2);
    }
  });

  it("bellatrix", () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const bellatrixConfig = createChainForkConfig({...config, BELLATRIX_FORK_EPOCH: 100});
    const state = generateState(
      {slot: computeStartSlotAtEpoch(bellatrixConfig.BELLATRIX_FORK_EPOCH) + 100},
      bellatrixConfig
    );
    expect(state.validators.length).to.be.equal(16);
    for (let i = 0; i < state.validators.length; i++) {
      state.validators.get(i).withdrawalCredentials = Buffer.alloc(32, i % 2);
    }
    state.commit();
    const validatorsBytes = state.validators.serialize();
    const stateBytes = state.serialize();
    expect(getValidatorsBytesFromStateBytes(bellatrixConfig, stateBytes)).to.be.deep.equal(validatorsBytes);
    for (let i = 0; i < state.validators.length; i++) {
      expect(getWithdrawalCredentialFirstByteFromValidatorBytes(validatorsBytes, i)).to.be.equal(i % 2);
    }
  });

  // TODO: figure out the "undefined or null" error in the test below
  it.skip("capella", () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const capellaConfig = createChainForkConfig({...config, CAPELLA_FORK_EPOCH: 100});
    const state = generateState({slot: computeStartSlotAtEpoch(capellaConfig.CAPELLA_FORK_EPOCH) + 100}, capellaConfig);
    expect(state.validators.length).to.be.equal(16);
    for (let i = 0; i < state.validators.length; i++) {
      state.validators.get(i).withdrawalCredentials = Buffer.alloc(32, i % 2);
    }
    state.commit();
    const validatorsBytes = state.validators.serialize();
    const stateBytes = state.serialize();
    expect(getValidatorsBytesFromStateBytes(capellaConfig, stateBytes)).to.be.deep.equal(validatorsBytes);
    for (let i = 0; i < state.validators.length; i++) {
      expect(getWithdrawalCredentialFirstByteFromValidatorBytes(validatorsBytes, i)).to.be.equal(i % 2);
    }
  });
});

function attestationFromValues(
  slot: Slot,
  blockRoot: RootHex,
  targetEpoch: Epoch,
  targetRoot: RootHex
): phase0.Attestation {
  const attestation = ssz.phase0.Attestation.defaultValue();
  attestation.data.slot = slot;
  attestation.data.beaconBlockRoot = fromHex(blockRoot);
  attestation.data.target.epoch = targetEpoch;
  attestation.data.target.root = fromHex(targetRoot);
  return attestation;
}

function signedAggregateAndProofFromValues(
  slot: Slot,
  blockRoot: RootHex,
  targetEpoch: Epoch,
  targetRoot: RootHex
): phase0.SignedAggregateAndProof {
  const signedAggregateAndProof = ssz.phase0.SignedAggregateAndProof.defaultValue();
  signedAggregateAndProof.message.aggregate.data.slot = slot;
  signedAggregateAndProof.message.aggregate.data.beaconBlockRoot = fromHex(blockRoot);
  signedAggregateAndProof.message.aggregate.data.target.epoch = targetEpoch;
  signedAggregateAndProof.message.aggregate.data.target.root = fromHex(targetRoot);
  return signedAggregateAndProof;
}

function signedBeaconBlockFromValues(slot: Slot): phase0.SignedBeaconBlock {
  const signedBeaconBlock = ssz.phase0.SignedBeaconBlock.defaultValue();
  signedBeaconBlock.message.slot = slot;
  return signedBeaconBlock;
}

function signedBlobSidecarFromValues(slot: Slot): deneb.SignedBlobSidecar {
  const signedBlobSidecar = ssz.deneb.SignedBlobSidecar.defaultValue();
  signedBlobSidecar.message.slot = slot;
  return signedBlobSidecar;
}
