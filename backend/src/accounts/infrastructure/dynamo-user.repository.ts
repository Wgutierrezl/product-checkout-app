import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConditionalCheckFailedException, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ResultAsync } from 'neverthrow';

import { ConflictError, UnexpectedError, NotFoundError } from '../../shared/errors/domain-error';
import { AppResult, AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { resolveTableName } from '../../shared/config/resolve-table-name';
import { DYNAMO_DOCUMENT_CLIENT } from '../../shared/infrastructure/dynamo/dynamo-client.provider';
import { User, UserPreferences } from '../domain/user.entity';
import { normalizeEmail } from '../domain/normalize-email';
import { UserRepositoryPort } from '../domain/user.repository.port';

export const USERS_TABLE_NAME = resolveTableName(process.env.USERS_TABLE_NAME, 'Users');
export const USERS_EMAIL_INDEX_NAME = 'EmailIndex';

interface UserItem {
  userId: string;
  fullName: string;
  email: string;
  passwordHash: string;
  preferences?: UserPreferences;
}

function toUser(item: UserItem): AppResult<User> {
  return User.create({
    id: item.userId,
    fullName: item.fullName,
    email: item.email,
    passwordHash: item.passwordHash,
    preferences: item.preferences,
  });
}

@Injectable()
export class DynamoUserRepository implements UserRepositoryPort {
  private readonly logger = new Logger(DynamoUserRepository.name);

  constructor(@Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient) {}

  findById(id: string): AppResultAsync<User> {
    return ResultAsync.fromPromise(
      this.client.send(new GetCommand({ TableName: USERS_TABLE_NAME, Key: { userId: id } })),
      (error) => new UnexpectedError(`Failed to get user ${id}: ${(error as Error).message}`),
    ).andThen((result) => {
      if (!result.Item) {
        return errAsync(new NotFoundError(`User ${id} not found`));
      }

      const user = toUser(result.Item as UserItem);
      return user.isOk() ? okAsync(user.value) : errAsync(user.error);
    });
  }

  /**
   * At most one user is expected per email — see `UserRepositoryPort`'s doc.
   * `Limit: 2` (not 1) intentionally lets us *detect* a violation of that
   * invariant instead of silently truncating it away.
   */
  findByEmail(email: string): AppResultAsync<User | null> {
    return ResultAsync.fromPromise(
      this.client.send(
        new QueryCommand({
          TableName: USERS_TABLE_NAME,
          IndexName: USERS_EMAIL_INDEX_NAME,
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': email },
          Limit: 2,
        }),
      ),
      (error) => new UnexpectedError(`Failed to query user by email: ${(error as Error).message}`),
    ).andThen((result) => {
      const items = (result.Items ?? []) as UserItem[];

      if (items.length === 0) {
        return okAsync(null);
      }

      if (items.length > 1) {
        this.logger.warn(
          `Found multiple users for one email lookup, expected at most one. userIds=${items
            .map((item) => item.userId)
            .join(', ')}`,
        );
      }

      const user = toUser(items[0]);
      return user.isOk() ? okAsync(user.value) : errAsync(user.error);
    });
  }

  /**
   * Enforces at-most-one-user-per-email with a `TransactWriteItems` of two
   * `Put`s (real user item + `EMAIL#<lowercased email>` guard item), exactly
   * mirroring `DynamoCustomerRepository.create()`'s guard-item mechanism.
   *
   * Deliberately DIFFERENT failure behavior on a race: `DynamoCustomerRepository`
   * re-reads and returns the winner (an anonymous upsert-by-email flow, where
   * that's the desired outcome). Returning the winner here would mean a
   * registration request silently "succeeds" by handing the caller a
   * DIFFERENT account than the one they think they just created — a
   * correctness/security bug for auth. Instead, a race is a `ConflictError`
   * (409), same as the fast-path duplicate-email check in `RegisterUseCase`.
   */
  create(user: User): AppResultAsync<User> {
    return ResultAsync.fromPromise(
      this.putUserWithEmailGuard(user),
      (error) => {
        if (error instanceof TransactionCanceledException) {
          return new ConflictError(`A user with email ${user.email} already exists`);
        }
        return new UnexpectedError(`Failed to create user ${user.id}: ${(error as Error).message}`);
      },
    );
  }

  /**
   * PUT semantics (replaces the whole `preferences` map), conditioned on the
   * user existing — `ConditionalCheckFailedException` means an unknown
   * `userId` (e.g. a deleted account, or a forged JWT `sub`), returned as
   * `NotFoundError` rather than silently creating a garbage row.
   * `ReturnValues: 'ALL_NEW'` avoids a separate re-read on the success path.
   */
  updatePreferences(userId: string, preferences: UserPreferences): AppResultAsync<User> {
    return ResultAsync.fromPromise(
      this.client.send(
        new UpdateCommand({
          TableName: USERS_TABLE_NAME,
          Key: { userId },
          ConditionExpression: 'attribute_exists(userId)',
          UpdateExpression: 'SET preferences = :preferences',
          ExpressionAttributeValues: { ':preferences': preferences },
          ReturnValues: 'ALL_NEW',
        }),
      ),
      (error) => {
        if (error instanceof ConditionalCheckFailedException) {
          return new NotFoundError(`User ${userId} not found`);
        }
        return new UnexpectedError(`Failed to update preferences for user ${userId}: ${(error as Error).message}`);
      },
    ).andThen((result) => {
      const user = toUser(result.Attributes as UserItem);
      return user.isOk() ? okAsync(user.value) : errAsync(user.error);
    });
  }

  private async putUserWithEmailGuard(user: User): Promise<User> {
    // `user.email` is already normalized by `User.create` by the time it
    // reaches here (every construction path goes through it) — using the
    // shared `normalizeEmail` helper instead of an inline `.toLowerCase()`
    // keeps this guard key byte-for-byte consistent with `findByEmail`'s
    // lookups even if a future caller ever constructs a `User`-shaped value
    // that bypassed `User.create`.
    const emailGuardKey = `EMAIL#${normalizeEmail(user.email)}`;

    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: USERS_TABLE_NAME,
              Item: {
                userId: user.id,
                fullName: user.fullName,
                email: user.email,
                passwordHash: user.passwordHash,
              },
              ConditionExpression: 'attribute_not_exists(userId)',
            },
          },
          {
            Put: {
              TableName: USERS_TABLE_NAME,
              Item: { userId: emailGuardKey },
              ConditionExpression: 'attribute_not_exists(userId)',
            },
          },
        ],
      }),
    );

    return user;
  }
}
