import { Inject, Injectable, Logger } from '@nestjs/common';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ResultAsync } from 'neverthrow';

import { NotFoundError, UnexpectedError } from '../../shared/errors/domain-error';
import { AppResult, AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { resolveTableName } from '../../shared/config/resolve-table-name';
import { DYNAMO_DOCUMENT_CLIENT } from '../../shared/infrastructure/dynamo/dynamo-client.provider';
import { Delivery } from '../domain/delivery.entity';
import { DeliveryRepositoryPort } from '../domain/delivery.repository.port';

export const DELIVERIES_TABLE_NAME = resolveTableName(process.env.DELIVERIES_TABLE_NAME, 'Deliveries');
export const DELIVERIES_TRANSACTION_ID_INDEX_NAME = 'TransactionIdIndex';

interface DeliveryItem {
  deliveryId: string;
  transactionId: string;
  customerId: string;
  address: string;
  city: string;
  region: string;
  postalCode?: string;
  status: string;
  createdAt: string;
}

function toDelivery(item: DeliveryItem): AppResult<Delivery> {
  return Delivery.create({
    id: item.deliveryId,
    transactionId: item.transactionId,
    customerId: item.customerId,
    address: item.address,
    city: item.city,
    region: item.region,
    postalCode: item.postalCode,
    status: item.status,
    createdAt: item.createdAt,
  });
}

@Injectable()
export class DynamoDeliveryRepository implements DeliveryRepositoryPort {
  private readonly logger = new Logger(DynamoDeliveryRepository.name);

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

      const delivery = toDelivery(result.Item as DeliveryItem);
      return delivery.isOk() ? okAsync(delivery.value) : errAsync(delivery.error);
    });
  }

  /**
   * At most one delivery is expected per transaction (a transaction settles
   * — and creates its delivery — exactly once, inside the settlement
   * `TransactWriteItems`). `Limit: 2` (not 1) is intentional: it lets us *detect* a
   * violation of that invariant instead of silently hiding it behind a
   * `Limit: 1` truncation.
   */
  findByTransactionId(transactionId: string): AppResultAsync<Delivery | null> {
    return ResultAsync.fromPromise(
      this.client.send(
        new QueryCommand({
          TableName: DELIVERIES_TABLE_NAME,
          IndexName: DELIVERIES_TRANSACTION_ID_INDEX_NAME,
          KeyConditionExpression: 'transactionId = :transactionId',
          ExpressionAttributeValues: { ':transactionId': transactionId },
          Limit: 2,
        }),
      ),
      (error) =>
        new UnexpectedError(`Failed to query delivery by transaction id: ${(error as Error).message}`),
    ).andThen((result) => {
      const items = (result.Items ?? []) as DeliveryItem[];

      if (items.length === 0) {
        return okAsync(null);
      }

      if (items.length > 1) {
        this.logger.warn(
          `Found multiple deliveries for one transaction id lookup, expected at most one. deliveryIds=${items
            .map((item) => item.deliveryId)
            .join(', ')}`,
        );
      }

      const delivery = toDelivery(items[0]);
      return delivery.isOk() ? okAsync(delivery.value) : errAsync(delivery.error);
    });
  }
}
