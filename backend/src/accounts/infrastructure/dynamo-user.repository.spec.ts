import { Logger } from '@nestjs/common';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import {
  USERS_EMAIL_INDEX_NAME,
  USERS_TABLE_NAME,
  DynamoUserRepository,
} from './dynamo-user.repository';

describe('DynamoUserRepository', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
  });

  describe('findById', () => {
    it('returns the user when the item exists', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user-1',
          fullName: 'Jane Doe',
          email: 'jane.doe@example.com',
          passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        },
      });
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('user-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        id: 'user-1',
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        preferences: undefined,
      });
      expect(ddbMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
        TableName: USERS_TABLE_NAME,
        Key: { userId: 'user-1' },
      });
    });

    it('returns NotFoundError when the item does not exist', async () => {
      ddbMock.on(GetCommand).resolves({});
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('missing-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('NotFound');
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(GetCommand).rejects(new Error('network error'));
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns ValidationError when the stored item has corrupt data', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          userId: 'user-1',
          fullName: 'Jane Doe',
          email: 'not-an-email',
          passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        },
      });
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('user-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });
  });

  describe('findByEmail', () => {
    it('returns the user when a matching item is found via the EmailIndex GSI', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: 'user-1',
            fullName: 'Jane Doe',
            email: 'jane.doe@example.com',
            passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
          },
        ],
      });
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByEmail('jane.doe@example.com');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()?.id).toBe('user-1');
      const call = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
      expect(call.TableName).toBe(USERS_TABLE_NAME);
      expect(call.IndexName).toBe(USERS_EMAIL_INDEX_NAME);
      expect(call.ExpressionAttributeValues).toEqual({ ':email': 'jane.doe@example.com' });
      expect(call.Limit).toBe(2);
    });

    it('returns null when the query response has no Items array at all', async () => {
      ddbMock.on(QueryCommand).resolves({});
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByEmail('unknown@example.com');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns null when no user matches the email', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByEmail('unknown@example.com');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('network error'));
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByEmail('jane.doe@example.com');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns ValidationError when the matched item has corrupt data', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: 'user-1',
            fullName: 'Jane Doe',
            email: 'not-an-email',
            passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
          },
        ],
      });
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByEmail('not-an-email');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });

    it('logs a warning (ids only) and returns the first match when more than one item is found', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: 'user-1',
            fullName: 'Jane Doe',
            email: 'jane.doe@example.com',
            passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
          },
          {
            userId: 'user-2',
            fullName: 'Jane Doe Duplicate',
            email: 'jane.doe@example.com',
            passwordHash: '$2a$10$zzzzzzzzzzzzzzzzzzzzzz',
          },
        ],
      });
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByEmail('jane.doe@example.com');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()?.id).toBe('user-1');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('user-1, user-2'));

      warnSpy.mockRestore();
    });
  });

  describe('create', () => {
    const user = {
      id: 'user-1',
      fullName: 'Jane Doe',
      email: 'Jane.Doe@Example.com',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
    };

    it('persists the user and an email-uniqueness guard item in one transaction', async () => {
      ddbMock.on(TransactWriteCommand).resolves({});
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.create(user);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(user);
      const call = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
      expect(call.TransactItems).toEqual([
        {
          Put: {
            TableName: USERS_TABLE_NAME,
            Item: {
              userId: 'user-1',
              fullName: 'Jane Doe',
              email: 'Jane.Doe@Example.com',
              passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
            },
            ConditionExpression: 'attribute_not_exists(userId)',
          },
        },
        {
          Put: {
            TableName: USERS_TABLE_NAME,
            // Guard item: its userId is a synthetic, lowercase-normalized
            // "EMAIL#..." key, never a real user id.
            Item: { userId: 'EMAIL#jane.doe@example.com' },
            ConditionExpression: 'attribute_not_exists(userId)',
          },
        },
      ]);
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(TransactWriteCommand).rejects(new Error('network error'));
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.create(user);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns ConflictError — NOT the other account — when two concurrent registrations race on the same email', async () => {
      ddbMock.on(TransactWriteCommand).rejects(
        new TransactionCanceledException({ message: 'Transaction cancelled', $metadata: {} }),
      );
      const repository = new DynamoUserRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.create(user);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Conflict');
      // Never falls back to a QueryCommand lookup — unlike the anonymous
      // customer upsert flow, a registration race must fail outright rather
      // than silently return whichever account won the race.
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
    });
  });
});
