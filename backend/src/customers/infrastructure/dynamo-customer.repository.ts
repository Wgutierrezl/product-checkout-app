import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ResultAsync } from 'neverthrow';

import { UnexpectedError, NotFoundError } from '../../shared/errors/domain-error';
import { AppResult, AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
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

function toCustomer(item: CustomerItem): AppResult<Customer> {
  return Customer.create({
    id: item.customerId,
    fullName: item.fullName,
    email: item.email,
    phone: item.phone,
  });
}

@Injectable()
export class DynamoCustomerRepository implements CustomerRepositoryPort {
  private readonly logger = new Logger(DynamoCustomerRepository.name);

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

      const customer = toCustomer(result.Item as CustomerItem);
      return customer.isOk() ? okAsync(customer.value) : errAsync(customer.error);
    });
  }

  /**
   * At most one customer is expected per email. Note the `EmailIndex` GSI
   * itself does NOT enforce that — DynamoDB GSIs are not unique constraints,
   * they only make querying by `email` possible. The actual uniqueness
   * guarantee comes from `create()`'s `TransactWriteItems` guard item (see
   * below); this query is just the read path. `Limit: 2` (not 1) is
   * intentional: it lets us *detect* a violation of that invariant instead
   * of silently hiding it behind a `Limit: 1` truncation.
   */
  findByEmail(email: string): AppResultAsync<Customer | null> {
    return ResultAsync.fromPromise(
      this.client.send(
        new QueryCommand({
          TableName: CUSTOMERS_TABLE_NAME,
          IndexName: CUSTOMERS_EMAIL_INDEX_NAME,
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': email },
          Limit: 2,
        }),
      ),
      (error) =>
        new UnexpectedError(`Failed to query customer by email: ${(error as Error).message}`),
    ).andThen((result) => {
      const items = (result.Items ?? []) as CustomerItem[];

      if (items.length === 0) {
        return okAsync(null);
      }

      if (items.length > 1) {
        this.logger.warn(
          `Found multiple customers for one email lookup, expected at most one. customerIds=${items
            .map((item) => item.customerId)
            .join(', ')}`,
        );
      }

      const customer = toCustomer(items[0]);
      return customer.isOk() ? okAsync(customer.value) : errAsync(customer.error);
    });
  }

  /**
   * Enforces at-most-one-customer-per-email with a `TransactWriteItems` of
   * two `Put`s: the real customer item, plus a guard item whose `customerId`
   * is the synthetic key `EMAIL#<lowercased email>` (not a real customer
   * id). Both carry `attribute_not_exists(customerId)`, so if two requests
   * race on the same email, only one guard-item Put can win — the loser's
   * whole transaction is cancelled (`TransactionCanceledException`), and it
   * re-reads by email and returns the winner instead of failing.
   *
   * The guard item is never returned by any read path: it has no `email`
   * attribute, so `EmailIndex` (a sparse GSI) never projects it, and
   * `GET /customers/:id` already rejects any non-UUID-v4 id — including
   * `EMAIL#...` — before `findById` ever runs.
   */
  create(customer: Customer): AppResultAsync<Customer> {
    return ResultAsync.fromPromise(
      this.putCustomerWithEmailGuard(customer),
      (error) => new UnexpectedError(`Failed to create customer ${customer.id}: ${(error as Error).message}`),
    );
  }

  private async putCustomerWithEmailGuard(customer: Customer): Promise<Customer> {
    const emailGuardKey = `EMAIL#${customer.email.toLowerCase()}`;

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: CUSTOMERS_TABLE_NAME,
                Item: {
                  customerId: customer.id,
                  fullName: customer.fullName,
                  email: customer.email,
                  phone: customer.phone,
                },
                ConditionExpression: 'attribute_not_exists(customerId)',
              },
            },
            {
              Put: {
                TableName: CUSTOMERS_TABLE_NAME,
                Item: { customerId: emailGuardKey },
                ConditionExpression: 'attribute_not_exists(customerId)',
              },
            },
          ],
        }),
      );
      return customer;
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) {
        throw error;
      }

      const existing = await this.findByEmail(customer.email);
      if (existing.isOk() && existing.value) {
        return existing.value;
      }

      throw error;
    }
  }
}
