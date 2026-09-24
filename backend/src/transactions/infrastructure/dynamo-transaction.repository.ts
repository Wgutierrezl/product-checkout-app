import { Inject, Injectable } from '@nestjs/common';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { Result, ResultAsync } from 'neverthrow';

import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { NotFoundError, UnexpectedError } from '../../shared/errors/domain-error';
import { AppResult, AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { DYNAMO_DOCUMENT_CLIENT } from '../../shared/infrastructure/dynamo/dynamo-client.provider';
import { Transaction } from '../domain/transaction.entity';
import {
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

  createPending(input: CreatePendingTransactionInput): AppResultAsync<Transaction> {
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
      this.client.send(
        new PutCommand({
          TableName: TRANSACTIONS_TABLE_NAME,
          Item: item,
          ConditionExpression: 'attribute_not_exists(transactionId)',
        }),
      ),
      (error) =>
        new UnexpectedError(`Failed to create pending transaction ${input.id}: ${(error as Error).message}`),
      // `input`'s fields are already validated value objects (Money/Quantity)
      // plus required delivery strings, so the resulting Transaction is
      // constructed directly here instead of round-tripping through
      // `toTransaction()` — there is no way for this specific mapping to
      // fail given an already-valid `CreatePendingTransactionInput`.
    ).map(() => ({
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
    }));
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
