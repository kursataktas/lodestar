import {ssz, capella} from "@lodestar/types";
import {MAX_EFFECTIVE_BALANCE, MAX_WITHDRAWALS_PER_PAYLOAD} from "@lodestar/params";

import {CachedBeaconStateCapella} from "../types.js";
import {decreaseBalance, hasEth1WithdrawalCredential} from "../util/index.js";

export function processWithdrawals(
  state: CachedBeaconStateCapella,
  payload: capella.FullOrBlindedExecutionPayload
): void {
  const {withdrawals: expectedWithdrawals} = getExpectedWithdrawals(state);
  const numWithdrawals = expectedWithdrawals.length;

  if (expectedWithdrawals.length !== payload.withdrawals.length) {
    throw Error(`Invalid withdrawals length expected=${numWithdrawals} actual=${payload.withdrawals.length}`);
  }
  for (let i = 0; i < numWithdrawals; i++) {
    const withdrawal = expectedWithdrawals[i];
    if (!ssz.capella.Withdrawal.equals(withdrawal, payload.withdrawals[i])) {
      throw Error(`Withdrawal mismatch at index=${i}`);
    }
    decreaseBalance(state, withdrawal.validatorIndex, Number(withdrawal.amount));
  }
  if (expectedWithdrawals.length > 0) {
    const latestWithdrawal = expectedWithdrawals[expectedWithdrawals.length - 1];
    state.nextWithdrawalIndex = latestWithdrawal.index + 1;
    state.nextWithdrawalValidatorIndex = (latestWithdrawal.validatorIndex + 1) % state.validators.length;
  }
}

export function getExpectedWithdrawals(
  state: CachedBeaconStateCapella,
  skipWithdrawals = true
): {withdrawals: capella.Withdrawal[]; sampledValidators: number} {
  if (skipWithdrawals) {
    return {withdrawals: [], sampledValidators: 0};
  }
  const epoch = state.epochCtx.epoch;
  let withdrawalIndex = state.nextWithdrawalIndex;
  const {validators, balances, nextWithdrawalValidatorIndex} = state;
  const validatorCount = validators.length;

  let n = 0;

  const withdrawals: capella.Withdrawal[] = [];
  // Just run a bounded loop max iterating over all withdrawals
  // however breaks out once we have MAX_WITHDRAWALS_PER_PAYLOAD
  for (n = 0; n < validatorCount; n++) {
    // Get next validator in turn
    const validatorIndex = (nextWithdrawalValidatorIndex + n) % validators.length;

    // It's most likely for validators to not have set eth1 credentials, than having 0 balance
    const validator = validators.getReadonly(validatorIndex);
    if (!hasEth1WithdrawalCredential(validator.withdrawalCredentials)) {
      continue;
    }

    const balance = balances.get(validatorIndex);

    if (balance > 0 && validator.withdrawableEpoch <= epoch) {
      withdrawals.push({
        index: withdrawalIndex,
        validatorIndex,
        address: validator.withdrawalCredentials.slice(12),
        amount: BigInt(balance),
      });
      withdrawalIndex++;
    } else if (validator.effectiveBalance === MAX_EFFECTIVE_BALANCE && balance > MAX_EFFECTIVE_BALANCE) {
      withdrawals.push({
        index: withdrawalIndex,
        validatorIndex,
        address: validator.withdrawalCredentials.slice(12),
        amount: BigInt(balance - MAX_EFFECTIVE_BALANCE),
      });
      withdrawalIndex++;
    }

    // Break if we have enough to pack the block
    if (withdrawals.length >= MAX_WITHDRAWALS_PER_PAYLOAD) {
      break;
    }
  }

  return {withdrawals, sampledValidators: n};
}
