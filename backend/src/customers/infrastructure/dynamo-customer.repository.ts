import { Inject, Injectable } from '@nestjs/common';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ResultAsync } from 'neverthrow';

import { NotFoundError, UnexpectedError } from '../../shared/errors/domain-error';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { DYNAMO_DOCUMENT_CLIENT } from '../../shared/infrastructure/dynamo/dynamo-client.provider';
import { Customer } from '../domain/customer.entity';
import { CustomerRepositoryPort } from '../domain/customer.repository.port';

export const CUSTOMERS_TABLE_NAME = 'Customers';
export const CUSTOMERS_EMAIL_INDEX_NAME = 'EmailIndex';

interface CustomerItem {
  customerId: string;
  fullName: string;
  email: string;
  phone: string;
}

function toCustomer(item: CustomerItem): Customer {
  return {
    id: item.customerId,
    fullName: item.fullName,
    email: item.email,
    phone: item.phone,
  };
}

@Injectable()
export class DynamoCustomerRepository implements CustomerRepositoryPort {
  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
  ) {}

  findById(id: string): AppResultAsync<Customer> {
    return ResultAsync.fromPromise(
      this.client.send(new GetCommand({ TableName: CUSTOMERS_TABLE_NAME, Key: { customerId: id } })),
      (error) => new UnexpectedError(`Failed to get customer ${id}: ${(error as Error).message}`),
    ).andThen((result) => {
      if (!result.Item) {
        return errAsync(new NotFoundError(`Customer ${id} not found`));
      }

      return okAsync(toCustomer(result.Item as CustomerItem));
    });
  }

  findByEmail(email: string): AppResultAsync<Customer | null> {
    return ResultAsync.fromPromise(
      this.client.send(
        new QueryCommand({
          TableName: CUSTOMERS_TABLE_NAME,
          IndexName: CUSTOMERS_EMAIL_INDEX_NAME,
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': email },
          Limit: 1,
        }),
      ),
      (error) =>
        new UnexpectedError(`Failed to query customer by email: ${(error as Error).message}`),
    ).map((result) => {
      const item = result.Items?.[0] as CustomerItem | undefined;
      return item ? toCustomer(item) : null;
    });
  }
}
