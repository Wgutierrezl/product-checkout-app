import { Inject, Injectable } from '@nestjs/common';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ResultAsync } from 'neverthrow';

import { NotFoundError, UnexpectedError } from '../../shared/errors/domain-error';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { DYNAMO_DOCUMENT_CLIENT } from '../../shared/infrastructure/dynamo/dynamo-client.provider';
import { Delivery, DeliveryStatus } from '../domain/delivery.entity';
import { DeliveryRepositoryPort } from '../domain/delivery.repository.port';

export const DELIVERIES_TABLE_NAME = 'Deliveries';
export const DELIVERIES_TRANSACTION_ID_INDEX_NAME = 'TransactionIdIndex';

interface DeliveryItem {
  deliveryId: string;
  transactionId: string;
  customerId: string;
  address: string;
  city: string;
  region: string;
  postalCode?: string;
  status: DeliveryStatus;
  createdAt: string;
}

function toDelivery(item: DeliveryItem): Delivery {
  return {
    id: item.deliveryId,
    transactionId: item.transactionId,
    customerId: item.customerId,
    address: item.address,
    city: item.city,
    region: item.region,
    postalCode: item.postalCode,
    status: item.status,
    createdAt: item.createdAt,
  };
}

@Injectable()
export class DynamoDeliveryRepository implements DeliveryRepositoryPort {
  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
  ) {}

  findById(id: string): AppResultAsync<Delivery> {
    return ResultAsync.fromPromise(
      this.client.send(new GetCommand({ TableName: DELIVERIES_TABLE_NAME, Key: { deliveryId: id } })),
      (error) => new UnexpectedError(`Failed to get delivery ${id}: ${(error as Error).message}`),
    ).andThen((result) => {
      if (!result.Item) {
        return errAsync(new NotFoundError(`Delivery ${id} not found`));
      }

      return okAsync(toDelivery(result.Item as DeliveryItem));
    });
  }

  findByTransactionId(transactionId: string): AppResultAsync<Delivery | null> {
    return ResultAsync.fromPromise(
      this.client.send(
        new QueryCommand({
          TableName: DELIVERIES_TABLE_NAME,
          IndexName: DELIVERIES_TRANSACTION_ID_INDEX_NAME,
          KeyConditionExpression: 'transactionId = :transactionId',
          ExpressionAttributeValues: { ':transactionId': transactionId },
          Limit: 1,
        }),
      ),
      (error) =>
        new UnexpectedError(`Failed to query delivery by transaction id: ${(error as Error).message}`),
    ).map((result) => {
      const item = result.Items?.[0] as DeliveryItem | undefined;
      return item ? toDelivery(item) : null;
    });
  }
}
