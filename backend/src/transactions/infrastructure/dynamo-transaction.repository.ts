import { Inject, Injectable } from '@nestjs/common';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { Result, ResultAsync } from 'neverthrow';

import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { NotFoundError, UnexpectedError } from '../../shared/errors/domain-error';
import { AppResult, AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { DYNAMO_DOCUMENT_CLIENT } from '../../shared/infrastructure/dynamo/dynamo-client.provider';
import { Transaction } from '../domain/transaction.entity';
import {
  CreatePendingResult,
  CreatePendingTransactionInput,
  TransactionRepositoryPort,
  UpdateGatewayResultInput,
} from '../domain/transaction.repository.port';

export const TRANSACTIONS_TABLE_NAME = 'Transactions';
export const TRANSACTIONS_REFERENCE_INDEX_NAME = 'ReferenceIndex';
export const TRANSACTIONS_GATEWAY_TX_INDEX_NAME = 'GatewayTxIndex';

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
}
