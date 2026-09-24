import { configureStore } from '@reduxjs/toolkit';
import {
  pollStarted,
  transactionCleared,
  transactionErrorSet,
  transactionReceived,
  transactionReducer,
} from './transactionSlice';

function buildStore() {
  return configureStore({ reducer: { transaction: transactionReducer } });
}

const AMOUNTS = { productAmount: 300_000, baseFee: 250_000, deliveryFee: 800_000, total: 1_350_000, currency: 'COP' as const };

describe('transactionSlice', () => {
  it('starts with no transaction and no error', () => {
    const store = buildStore();

    expect(store.getState().transaction).toEqual({
      id: null,
      status: null,
      amounts: null,
      error: null,
      pollStartedAt: null,
      reference: null,
    });
  });

  it('stores id/status/amounts on transactionReceived', () => {
    const store = buildStore();

    store.dispatch(transactionReceived({ id: 't1', status: 'PENDING', amounts: AMOUNTS, reference: 'ref-1' }));

    expect(store.getState().transaction).toMatchObject({ id: 't1', status: 'PENDING', amounts: AMOUNTS });
  });

  it('stores the reference on transactionReceived', () => {
    const store = buildStore();

    store.dispatch(transactionReceived({ id: 't1', status: 'PENDING', amounts: AMOUNTS, reference: 'ref-1' }));

    expect(store.getState().transaction.reference).toBe('ref-1');
  });

  it('clears any prior error when a transaction is received', () => {
    const store = buildStore();
    store.dispatch(transactionErrorSet('network error'));

    store.dispatch(transactionReceived({ id: 't1', status: 'APPROVED', amounts: AMOUNTS, reference: 'ref-1' }));

    expect(store.getState().transaction.error).toBeNull();
  });

  it('updates only the status on a later transactionReceived (poll refresh), keeping amounts', () => {
    const store = buildStore();
    store.dispatch(transactionReceived({ id: 't1', status: 'PENDING', amounts: AMOUNTS, reference: 'ref-1' }));

    store.dispatch(transactionReceived({ id: 't1', status: 'APPROVED', amounts: AMOUNTS, reference: 'ref-1' }));

    expect(store.getState().transaction.status).toBe('APPROVED');
    expect(store.getState().transaction.amounts).toEqual(AMOUNTS);
  });

  it('records the poll start timestamp via pollStarted', () => {
    const store = buildStore();

    store.dispatch(pollStarted(123456));

    expect(store.getState().transaction.pollStartedAt).toBe(123456);
  });

  it('sets an error message via transactionErrorSet', () => {
    const store = buildStore();

    store.dispatch(transactionErrorSet('Transaction not found'));

    expect(store.getState().transaction.error).toBe('Transaction not found');
  });

  it('resets to the initial state on transactionCleared', () => {
    const store = buildStore();
    store.dispatch(transactionReceived({ id: 't1', status: 'APPROVED', amounts: AMOUNTS, reference: 'ref-1' }));
    store.dispatch(pollStarted(123456));

    store.dispatch(transactionCleared());

    expect(store.getState().transaction).toEqual({
      id: null,
      status: null,
      amounts: null,
      error: null,
      pollStartedAt: null,
      reference: null,
    });
  });
});
