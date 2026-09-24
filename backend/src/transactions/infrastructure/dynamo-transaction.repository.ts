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

export const TRANSACTIONS_TABLE_NAME = 'Transactions';
export const TRANSACTIONS_REFERENCE_INDEX_NAME = 'ReferenceIndex';
export const TRANSACTIONS_GATEWAY_TX_INDEX_NAME = 'GatewayTxIndex';

/** Outcome of attempting the 3-item settlement `TransactWriteItems`. */
type SettleAttemptOutcome = 'settled' | 'racedByTransactionCondition' | 'oversold';

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

  updateGatewayResult(id: string, input: UpdateGatewayResultInput): AppResultAsync<Transaction> {
    const names: Record<string, string> = { '#status': 'status', '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':status': input.status, ':updatedAt': input.updatedAt };
    let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt';

    if (input.gatewayTransactionId !== undefined) {
      names['#gatewayTransactionId'] = 'gatewayTransactionId';
      values[':gatewayTransactionId'] = input.gatewayTransactionId;
      updateExpression += ', #gatewayTransactionId = :gatewayTransactionId';
    }

    if (input.lastGatewayCheckAt !== undefined) {
      names['#lastGatewayCheckAt'] = 'lastGatewayCheckAt';
      values[':lastGatewayCheckAt'] = input.lastGatewayCheckAt;
      updateExpression += ', #lastGatewayCheckAt = :lastGatewayCheckAt';
    }

    return ResultAsync.fromPromise(
      this.client.send(
        new UpdateCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          Key: { transactionId: id },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        }),
      ),
      (error) =>
        new UnexpectedError(`Failed to update transaction ${id} gateway result: ${(error as Error).message}`),
    ).andThen((result) => {
      const transaction = toTransaction(result.Attributes as TransactionItem);
      return transaction.isOk() ? okAsync(transaction.value) : errAsync(transaction.error);
    });
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
   * - Transactions condition failed -> a concurrent caller already settled
   *   this transaction (race loser) -> re-read and return its current state.
   * - Products condition failed -> oversold race: the buyer was already
   *   charged, so the transaction is still marked APPROVED, but WITHOUT
   *   decrementing stock or creating a delivery. Logged for manual
   *   reconciliation (restock or refund) since this should be rare in
   *   practice (stock was already checked at create time).
   * - Any other/unexpected shape -> treated conservatively as a race rather
   *   than crashing; re-read and return current state.
   */
  settleApproved(input: SettleApprovedInput): AppResultAsync<Transaction> {
    return ResultAsync.fromPromise(
      this.attemptSettleApproved(input),
      (error) =>
        new UnexpectedError(`Failed to settle transaction ${input.transactionId} as APPROVED: ${(error as Error).message}`),
    ).andThen((outcome) => this.finishSettleApproved(input, outcome));
  }

  private async attemptSettleApproved(input: SettleApprovedInput): Promise<SettleAttemptOutcome> {
    const transactionNames: Record<string, string> = { '#status': 'status', '#updatedAt': 'updatedAt' };
    const transactionValues: Record<string, unknown> = {
      ':pending': 'PENDING',
      ':approved': 'APPROVED',
      ':now': input.updatedAt,
    };
    let transactionUpdateExpression = 'SET #status = :approved, #updatedAt = :now';
    if (input.gatewayTransactionId !== undefined) {
      transactionNames['#gatewayTransactionId'] = 'gatewayTransactionId';
      transactionValues[':gatewayTransactionId'] = input.gatewayTransactionId;
      transactionUpdateExpression += ', #gatewayTransactionId = :gatewayTransactionId';
    }

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TRANSACTIONS_TABLE_NAME,
                Key: { transactionId: input.transactionId },
                ConditionExpression: '#status = :pending',
                UpdateExpression: transactionUpdateExpression,
                ExpressionAttributeNames: transactionNames,
                ExpressionAttributeValues: transactionValues,
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
      // Any other cancellation shape (including the Deliveries item alone,
      // which given a freshly-generated deliveryId should never happen in
      // practice) is treated conservatively as a benign race rather than
      // crashing — the re-read below reports whatever the current state is.
      return 'racedByTransactionCondition';
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
      this.markApprovedWithoutStockOrDelivery(input),
      (error) =>
        new UnexpectedError(
          `Failed to mark oversold transaction ${input.transactionId} as APPROVED: ${(error as Error).message}`,
        ),
    ).andThen(() => this.findById(input.transactionId));
  }

  private async markApprovedWithoutStockOrDelivery(input: SettleApprovedInput): Promise<void> {
    const names: Record<string, string> = { '#status': 'status', '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':pending': 'PENDING', ':approved': 'APPROVED', ':now': input.updatedAt };
    let updateExpression = 'SET #status = :approved, #updatedAt = :now';
    if (input.gatewayTransactionId !== undefined) {
      names['#gatewayTransactionId'] = 'gatewayTransactionId';
      values[':gatewayTransactionId'] = input.gatewayTransactionId;
      updateExpression += ', #gatewayTransactionId = :gatewayTransactionId';
    }

    try {
      await this.client.send(
        new UpdateCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          Key: { transactionId: input.transactionId },
          ConditionExpression: '#status = :pending',
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }
      // Already settled by a concurrent caller in the meantime — fine, the
      // caller's re-read (`findById`) will report whatever won.
    }
  }

  /**
   * Conditioned (status = PENDING) update to a terminal non-approved status.
   * A `ConditionalCheckFailedException` means a concurrent caller already
   * finalized this transaction (race loser) — re-read and return its
   * current state rather than failing.
   */
  finalizeNonApproved(input: FinalizeNonApprovedInput): AppResultAsync<Transaction> {
    return ResultAsync.fromPromise(
      this.updateStatusIfPending(input),
      (error) =>
        new UnexpectedError(`Failed to finalize transaction ${input.transactionId} as ${input.status}: ${(error as Error).message}`),
    ).andThen(() => this.findById(input.transactionId));
  }

  private async updateStatusIfPending(input: FinalizeNonApprovedInput): Promise<void> {
    const names: Record<string, string> = { '#status': 'status', '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':pending': 'PENDING', ':status': input.status, ':now': input.updatedAt };
    let updateExpression = 'SET #status = :status, #updatedAt = :now';
    if (input.gatewayTransactionId !== undefined) {
      names['#gatewayTransactionId'] = 'gatewayTransactionId';
      values[':gatewayTransactionId'] = input.gatewayTransactionId;
      updateExpression += ', #gatewayTransactionId = :gatewayTransactionId';
    }

    try {
      await this.client.send(
        new UpdateCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          Key: { transactionId: input.transactionId },
          ConditionExpression: '#status = :pending',
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }
      // Race loser — already finalized by a concurrent caller. Fine.
    }
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
