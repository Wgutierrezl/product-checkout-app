import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConditionalCheckFailedException, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Result, ResultAsync } from 'neverthrow';

import { DELIVERIES_TABLE_NAME } from '../../deliveries/infrastructure/dynamo-delivery.repository';
import { PRODUCTS_TABLE_NAME } from '../../products/infrastructure/dynamo-product.repository';
import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { resolveTableName } from '../../shared/config/resolve-table-name';
import { NotFoundError, UnexpectedError } from '../../shared/errors/domain-error';
import { AppResult, AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { DYNAMO_DOCUMENT_CLIENT } from '../../shared/infrastructure/dynamo/dynamo-client.provider';
import { Transaction } from '../domain/transaction.entity';
import {
  CreatePendingResult,
  CreatePendingTransactionInput,
  FinalizeNonApprovedInput,
  SettleApprovedInput,
  TransactionRepositoryPort,
  UpdateGatewayResultInput,
} from '../domain/transaction.repository.port';

export const TRANSACTIONS_TABLE_NAME = resolveTableName(
  process.env.TRANSACTIONS_TABLE_NAME,
  'Transactions',
);
export const TRANSACTIONS_REFERENCE_INDEX_NAME = 'ReferenceIndex';
export const TRANSACTIONS_GATEWAY_TX_INDEX_NAME = 'GatewayTxIndex';
export const TRANSACTIONS_USER_ID_INDEX_NAME = 'UserIdIndex';

/**
 * `findByUserId` has no server-side pagination (the GSI has no sort key, so
 * newest-first ordering happens in this adapter after a full query) — a
 * flat cap at the latest 50 purchases is a deliberate, stated simplification
 * for a demo-scale workload, not real cursor-based pagination. Revisit if
 * a single account's purchase history could plausibly exceed this.
 */
export const TRANSACTIONS_USER_ID_HISTORY_LIMIT = 50;

/** Outcome of attempting the 3-item settlement `TransactWriteItems`. */
type SettleAttemptOutcome = 'settled' | 'racedByTransactionCondition' | 'oversold';
/** Internal-only outcome of a single TransactWriteItems attempt, before the retry-once policy is applied. */
type SettleAttemptRawOutcome = SettleAttemptOutcome | 'retry';

interface StatusUpdateInput {
  status: string;
  updatedAt: string;
  gatewayTransactionId?: string;
}

interface StatusUpdateExpression {
  updateExpression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
}

/**
 * Shared SET-expression builder for every write that transitions
 * `Transactions.status` (`updateGatewayResult`, `settleApproved`'s
 * transaction item, its oversold fallback, and `finalizeNonApproved`).
 * Callers add their own `ConditionExpression`/`:pending` value on top — this
 * only builds the SET side, so the same three pieces (names/values/expression)
 * are never hand-duplicated per call site.
 */
function buildStatusUpdate(input: StatusUpdateInput): StatusUpdateExpression {
  const names: Record<string, string> = { '#status': 'status', '#updatedAt': 'updatedAt' };
  const values: Record<string, unknown> = { ':status': input.status, ':updatedAt': input.updatedAt };
  let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt';

  if (input.gatewayTransactionId !== undefined) {
    names['#gatewayTransactionId'] = 'gatewayTransactionId';
    values[':gatewayTransactionId'] = input.gatewayTransactionId;
    updateExpression += ', #gatewayTransactionId = :gatewayTransactionId';
  }

  return { updateExpression, names, values };
}

interface TransactionItem {
  transactionId: string;
  reference: string;
  customerId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  baseFeeCents: number;
  deliveryFeeCents: number;
  totalAmountCents: number;
  status: string;
  gatewayTransactionId?: string;
  lastGatewayCheckAt?: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryRegion: string;
  deliveryPostalCode?: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

function toTransaction(item: TransactionItem): AppResult<Transaction> {
  return Result.combine([
    Quantity.create(item.quantity),
    Money.create(item.unitPriceCents),
    Money.create(item.baseFeeCents),
    Money.create(item.deliveryFeeCents),
    Money.create(item.totalAmountCents),
  ]).andThen(([quantity, unitPrice, baseFee, deliveryFee, totalAmount]) =>
    Transaction.create({
      id: item.transactionId,
      reference: item.reference,
      customerId: item.customerId,
      productId: item.productId,
      quantity,
      unitPrice,
      baseFee,
      deliveryFee,
      totalAmount,
      status: item.status,
      gatewayTransactionId: item.gatewayTransactionId,
      lastGatewayCheckAt: item.lastGatewayCheckAt,
      delivery: {
        address: item.deliveryAddress,
        city: item.deliveryCity,
        region: item.deliveryRegion,
        postalCode: item.deliveryPostalCode,
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      userId: item.userId,
    }),
  );
}

@Injectable()
export class DynamoTransactionRepository implements TransactionRepositoryPort {
  private readonly logger = new Logger(DynamoTransactionRepository.name);

  constructor(@Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient) {}

  /**
   * Idempotent on `input.id` (the client-supplied `idempotencyKey`): a
   * retried checkout request lands on the same row instead of a duplicate.
   * `ConditionalCheckFailedException` means a transaction with this id
   * already exists — re-read and return it with `wasCreated: false` rather
   * than treating the replay as an error.
   */
  createPending(input: CreatePendingTransactionInput): AppResultAsync<CreatePendingResult> {
    const item: TransactionItem = {
      transactionId: input.id,
      reference: input.reference,
      customerId: input.customerId,
      productId: input.productId,
      quantity: input.quantity.value,
      unitPriceCents: input.unitPrice.valueInCents,
      baseFeeCents: input.baseFee.valueInCents,
      deliveryFeeCents: input.deliveryFee.valueInCents,
      totalAmountCents: input.totalAmount.valueInCents,
      status: 'PENDING',
      deliveryAddress: input.delivery.address,
      deliveryCity: input.delivery.city,
      deliveryRegion: input.delivery.region,
      deliveryPostalCode: input.delivery.postalCode,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      // Conditionally spread (unlike `deliveryPostalCode` above, which is
      // always present, possibly `undefined`, relying on the doc client's
      // `removeUndefinedValues`): PR6's design amendment hard rule #1 makes
      // the guest path's byte-identical response — NO `userId` ATTRIBUTE at
      // all — an explicit, testable guarantee at the object-literal level,
      // not merely an artifact of marshalling config. See this file's own
      // spec: "never writes a userId attribute when the input omits it".
      ...(input.userId ? { userId: input.userId } : {}),
    };

    return ResultAsync.fromPromise(
      this.putPendingOrFindExisting(item, input.id),
      (error) =>
        new UnexpectedError(`Failed to create pending transaction ${input.id}: ${(error as Error).message}`),
    ).andThen((outcome) => {
      if (outcome.wasCreated) {
        // `input`'s fields are already validated value objects (Money/
        // Quantity) plus required delivery strings, so the resulting
        // Transaction is constructed directly here instead of
        // round-tripping through `toTransaction()` — there is no way for
        // this specific mapping to fail given an already-valid
        // `CreatePendingTransactionInput`.
        return okAsync({
          transaction: {
            id: input.id,
            reference: input.reference,
            customerId: input.customerId,
            productId: input.productId,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            baseFee: input.baseFee,
            deliveryFee: input.deliveryFee,
            totalAmount: input.totalAmount,
            status: 'PENDING' as const,
            delivery: input.delivery,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
            userId: input.userId,
          },
          wasCreated: true,
        });
      }

      const transaction = toTransaction(outcome.item);
      return transaction.isOk()
        ? okAsync({ transaction: transaction.value, wasCreated: false })
        : errAsync(transaction.error);
    });
  }

  private async putPendingOrFindExisting(
    item: TransactionItem,
    id: string,
  ): Promise<{ wasCreated: true } | { wasCreated: false; item: TransactionItem }> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          Item: item,
          ConditionExpression: 'attribute_not_exists(transactionId)',
        }),
      );
      return { wasCreated: true };
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }

      const existing = await this.client.send(
        new GetCommand({ TableName: TRANSACTIONS_TABLE_NAME, Key: { transactionId: id } }),
      );
      if (!existing.Item) {
        throw error;
      }

      return { wasCreated: false, item: existing.Item as TransactionItem };
    }
  }

  /**
   * BLOCKER FIX: every write touching `Transactions.status` after creation
   * must be condition-guarded — this one is no exception, even though its
   * only caller (`SettleTransactionUseCase.recordStillPending`) is only
   * reached when the transaction was PENDING at read time. A concurrent
   * settle (webhook racing a lazy-poll, or the reconciliation sweep) could
   * flip it to a terminal status between that read and this write.
   * `ConditionalCheckFailedException` = race lost — re-read and return the
   * CURRENT row, never as an error. `ReturnValues: 'ALL_NEW'` avoids a
   * re-read on the success path.
   */
  updateGatewayResult(id: string, input: UpdateGatewayResultInput): AppResultAsync<Transaction> {
    return ResultAsync.fromPromise(
      this.attemptConditionedStatusUpdate(id, {
        status: input.status,
        updatedAt: input.updatedAt,
        gatewayTransactionId: input.gatewayTransactionId,
        lastGatewayCheckAt: input.lastGatewayCheckAt,
      }),
      (error) =>
        new UnexpectedError(`Failed to update transaction ${id} gateway result: ${(error as Error).message}`),
    ).andThen((attributes) => this.resolveConditionedUpdateResult(id, attributes));
  }

  private async attemptConditionedStatusUpdate(
    id: string,
    input: StatusUpdateInput & { lastGatewayCheckAt?: string },
  ): Promise<Record<string, unknown> | null> {
    const { updateExpression, names, values } = buildStatusUpdate(input);
    let finalUpdateExpression = updateExpression;
    if (input.lastGatewayCheckAt !== undefined) {
      names['#lastGatewayCheckAt'] = 'lastGatewayCheckAt';
      values[':lastGatewayCheckAt'] = input.lastGatewayCheckAt;
      finalUpdateExpression += ', #lastGatewayCheckAt = :lastGatewayCheckAt';
    }

    try {
      const result = await this.client.send(
        new UpdateCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          Key: { transactionId: id },
          ConditionExpression: '#status = :pending',
          UpdateExpression: finalUpdateExpression,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: { ...values, ':pending': 'PENDING' },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return result.Attributes ?? null;
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }
      return null;
    }
  }

  private resolveConditionedUpdateResult(
    id: string,
    attributes: Record<string, unknown> | null,
  ): AppResultAsync<Transaction> {
    if (!attributes) {
      return this.findById(id);
    }
    const transaction = toTransaction(attributes as unknown as TransactionItem);
    return transaction.isOk() ? okAsync(transaction.value) : errAsync(transaction.error);
  }

  findById(id: string): AppResultAsync<Transaction> {
    return ResultAsync.fromPromise(
      this.client.send(new GetCommand({ TableName: TRANSACTIONS_TABLE_NAME, Key: { transactionId: id } })),
      (error) => new UnexpectedError(`Failed to get transaction ${id}: ${(error as Error).message}`),
    ).andThen((result) => {
      if (!result.Item) {
        return errAsync(new NotFoundError(`Transaction ${id} not found`));
      }

      const transaction = toTransaction(result.Item as TransactionItem);
      return transaction.isOk() ? okAsync(transaction.value) : errAsync(transaction.error);
    });
  }

  /**
   * Atomic 3-item `TransactWriteItems` per design's settlement snippet:
   * transition the transaction to APPROVED (conditioned on still PENDING),
   * decrement the product's stock (conditioned on sufficient stock), and
   * create the delivery (conditioned on not already existing). On
   * `TransactionCanceledException`, `CancellationReasons` tells us which
   * item's condition failed (`reasons[0]` = Transactions, `reasons[1]` =
   * Products, `reasons[2]` = Deliveries):
   * - `reasons[0]` ConditionalCheckFailed -> a concurrent caller already
   *   settled this transaction (race loser) -> re-read and return its
   *   current state. This takes PRIORITY even if `reasons[1]` also failed
   *   (nothing to oversell once the transaction itself is no longer PENDING).
   * - `reasons[1]` ConditionalCheckFailed (and `reasons[0]` did NOT fail) ->
   *   oversold race: the buyer was already charged, so the transaction is
   *   still marked APPROVED, but WITHOUT decrementing stock or creating a
   *   delivery. Logged at error level for manual reconciliation (restock or
   *   refund) since this should be rare in practice (stock was already
   *   checked at create time).
   * - Any other/unrecognized cancellation reason (e.g. `TransactionConflict`,
   *   a transient DynamoDB condition) -> retry the whole TransactWriteItems
   *   ONCE. If the retry also yields an unrecognized reason, give up and
   *   surface an `UnexpectedError` (masked 500) rather than silently
   *   guessing — this is NOT treated as a benign race.
   */
  settleApproved(input: SettleApprovedInput): AppResultAsync<Transaction> {
    return ResultAsync.fromPromise(
      this.attemptSettleApprovedWithRetry(input),
      (error) =>
        new UnexpectedError(`Failed to settle transaction ${input.transactionId} as APPROVED: ${(error as Error).message}`),
    ).andThen((outcome) => this.finishSettleApproved(input, outcome));
  }

  private async attemptSettleApprovedWithRetry(input: SettleApprovedInput): Promise<SettleAttemptOutcome> {
    const first = await this.trySettleApprovedTransactWrite(input);
    if (first !== 'retry') {
      return first;
    }

    this.logger.warn(
      `Unrecognized TransactWriteItems cancellation reason while settling transaction ${input.transactionId} ` +
        'as APPROVED — retrying once.',
    );
    const second = await this.trySettleApprovedTransactWrite(input);
    if (second === 'retry') {
      this.logger.error(
        `Settlement TransactWriteItems for transaction ${input.transactionId} failed twice with an ` +
          'unrecognized cancellation reason — giving up.',
      );
      throw new Error(
        `Settlement TransactWriteItems for transaction ${input.transactionId} failed twice with an unrecognized cancellation reason`,
      );
    }
    return second;
  }

  private async trySettleApprovedTransactWrite(input: SettleApprovedInput): Promise<SettleAttemptRawOutcome> {
    const { updateExpression, names, values } = buildStatusUpdate({ status: 'APPROVED', updatedAt: input.updatedAt, gatewayTransactionId: input.gatewayTransactionId });

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TRANSACTIONS_TABLE_NAME,
                Key: { transactionId: input.transactionId },
                ConditionExpression: '#status = :pending',
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: { ...values, ':pending': 'PENDING' },
              },
            },
            {
              Update: {
                TableName: PRODUCTS_TABLE_NAME,
                Key: { productId: input.productId },
                ConditionExpression: 'stock >= :qty',
                UpdateExpression: 'SET stock = stock - :qty',
                ExpressionAttributeValues: { ':qty': input.quantity.value },
              },
            },
            {
              Put: {
                TableName: DELIVERIES_TABLE_NAME,
                Item: {
                  deliveryId: input.deliveryId,
                  transactionId: input.transactionId,
                  customerId: input.customerId,
                  address: input.delivery.address,
                  city: input.delivery.city,
                  region: input.delivery.region,
                  postalCode: input.delivery.postalCode,
                  status: 'CREATED',
                  createdAt: input.updatedAt,
                },
                ConditionExpression: 'attribute_not_exists(deliveryId)',
              },
            },
          ],
        }),
      );
      return 'settled';
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) {
        throw error;
      }

      const reasons = error.CancellationReasons ?? [];
      if (reasons[0]?.Code === 'ConditionalCheckFailed') {
        return 'racedByTransactionCondition';
      }
      if (reasons[1]?.Code === 'ConditionalCheckFailed') {
        return 'oversold';
      }
      return 'retry';
    }
  }

  private finishSettleApproved(
    input: SettleApprovedInput,
    outcome: SettleAttemptOutcome,
  ): AppResultAsync<Transaction> {
    if (outcome !== 'oversold') {
      return this.findById(input.transactionId);
    }

    this.logger.error(
      `Oversold race detected while settling transaction ${input.transactionId} as APPROVED: ` +
        `productId=${input.productId} quantity=${input.quantity.value} — stock NOT decremented, ` +
        'delivery NOT created. Marking the transaction APPROVED anyway (payment already captured); ' +
        'flagged for manual reconciliation (restock or refund).',
    );

    return ResultAsync.fromPromise(
      this.attemptConditionedStatusUpdate(input.transactionId, {
        status: 'APPROVED',
        updatedAt: input.updatedAt,
        gatewayTransactionId: input.gatewayTransactionId,
      }),
      (error) =>
        new UnexpectedError(
          `Failed to mark oversold transaction ${input.transactionId} as APPROVED: ${(error as Error).message}`,
        ),
    ).andThen((attributes) => this.resolveConditionedUpdateResult(input.transactionId, attributes));
  }

  /**
   * Conditioned (status = PENDING) update to a terminal non-approved status.
   * A `ConditionalCheckFailedException` means a concurrent caller already
   * finalized this transaction (race loser) — re-read and return its
   * current state rather than failing. `ReturnValues: 'ALL_NEW'` avoids a
   * re-read on the success path.
   */
  finalizeNonApproved(input: FinalizeNonApprovedInput): AppResultAsync<Transaction> {
    return ResultAsync.fromPromise(
      this.attemptConditionedStatusUpdate(input.transactionId, {
        status: input.status,
        updatedAt: input.updatedAt,
        gatewayTransactionId: input.gatewayTransactionId,
      }),
      (error) =>
        new UnexpectedError(`Failed to finalize transaction ${input.transactionId} as ${input.status}: ${(error as Error).message}`),
    ).andThen((attributes) => this.resolveConditionedUpdateResult(input.transactionId, attributes));
  }

  touchLastGatewayCheckAt(transactionId: string, lastGatewayCheckAt: string): AppResultAsync<void> {
    return ResultAsync.fromPromise(
      this.client.send(
        new UpdateCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          Key: { transactionId },
          UpdateExpression: 'SET #lastGatewayCheckAt = :lastGatewayCheckAt',
          ExpressionAttributeNames: { '#lastGatewayCheckAt': 'lastGatewayCheckAt' },
          ExpressionAttributeValues: { ':lastGatewayCheckAt': lastGatewayCheckAt },
        }),
      ),
      (error) =>
        new UnexpectedError(`Failed to update lastGatewayCheckAt for ${transactionId}: ${(error as Error).message}`),
    ).map(() => undefined);
  }

  findByGatewayTransactionId(gatewayTransactionId: string): AppResultAsync<Transaction | null> {
    return this.findOneByIndex(
      TRANSACTIONS_GATEWAY_TX_INDEX_NAME,
      'gatewayTransactionId',
      gatewayTransactionId,
    );
  }

  findByReference(reference: string): AppResultAsync<Transaction | null> {
    return this.findOneByIndex(TRANSACTIONS_REFERENCE_INDEX_NAME, 'reference', reference);
  }

  /**
   * PR6's `GET /me/transactions`: every transaction for `userId` via the
   * additive `UserIdIndex` GSI. The GSI has no sort key, so this queries
   * without a `Limit` (a demo-scale per-user purchase count), then sorts
   * newest-first and caps at `TRANSACTIONS_USER_ID_HISTORY_LIMIT` in
   * application code — a stated simplification, not real pagination.
   */
  findByUserId(userId: string): AppResultAsync<Transaction[]> {
    return ResultAsync.fromPromise(
      this.client.send(
        new QueryCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          IndexName: TRANSACTIONS_USER_ID_INDEX_NAME,
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: { ':userId': userId },
        }),
      ),
      (error) => new UnexpectedError(`Failed to query transactions for user ${userId}: ${(error as Error).message}`),
    ).andThen((result) => {
      const items = (result.Items ?? []) as TransactionItem[];
      const transactions = Result.combine(items.map((item) => toTransaction(item)));

      if (transactions.isErr()) {
        return errAsync(transactions.error);
      }

      const sorted = [...transactions.value]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, TRANSACTIONS_USER_ID_HISTORY_LIMIT);
      return okAsync(sorted);
    });
  }

  /**
   * Shared query-by-GSI helper for both lookup paths the webhook handler
   * needs. `Limit: 2` (not 1) intentionally lets us *detect* more than one
   * match instead of silently truncating — see the analogous pattern in
   * `DynamoCustomerRepository.findByEmail`/`DynamoDeliveryRepository.findByTransactionId`.
   */
  private findOneByIndex(
    indexName: string,
    keyName: string,
    keyValue: string,
  ): AppResultAsync<Transaction | null> {
    return ResultAsync.fromPromise(
      this.client.send(
        new QueryCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          IndexName: indexName,
          // Always via a `#key` placeholder, never inlined: `reference` is a
          // reserved DynamoDB keyword and would otherwise throw
          // `ValidationException: Invalid KeyConditionExpression` (found live
          // against the real gateway sandbox during PR6's manual smoke test).
          KeyConditionExpression: '#key = :value',
          ExpressionAttributeNames: { '#key': keyName },
          ExpressionAttributeValues: { ':value': keyValue },
          Limit: 2,
        }),
      ),
      (error) =>
        new UnexpectedError(`Failed to query transaction by ${keyName}: ${(error as Error).message}`),
    ).andThen((result) => {
      const items = (result.Items ?? []) as TransactionItem[];

      if (items.length === 0) {
        return okAsync(null);
      }

      if (items.length > 1) {
        this.logger.warn(
          `Found multiple transactions for one ${keyName} lookup, expected at most one. transactionIds=${items
            .map((item) => item.transactionId)
            .join(', ')}`,
        );
      }

      const transaction = toTransaction(items[0]);
      return transaction.isOk() ? okAsync(transaction.value) : errAsync(transaction.error);
    });
  }
}
