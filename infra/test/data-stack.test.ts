import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { DataStack } from '../lib/data-stack';

function synthDataStack(): Template {
  const app = new App();
  const stack = new DataStack(app, 'TestDataStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('DataStack', () => {
  it('provisions exactly 5 DynamoDB tables with PAY_PER_REQUEST billing', () => {
    const template = synthDataStack();

    template.resourceCountIs('AWS::DynamoDB::Table', 5);
    template.allResourcesProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('creates the Products table keyed by productId', () => {
    const template = synthDataStack();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Products',
      KeySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }],
    });
  });

  it('creates the Customers table with an EmailIndex GSI projecting ALL', () => {
    const template = synthDataStack();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Customers',
      KeySchema: [{ AttributeName: 'customerId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'EmailIndex',
          KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
    });
  });

  it('creates the Deliveries table with a TransactionIdIndex GSI projecting ALL', () => {
    const template = synthDataStack();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Deliveries',
      KeySchema: [{ AttributeName: 'deliveryId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'TransactionIdIndex',
          KeySchema: [{ AttributeName: 'transactionId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
    });
  });

  it('creates the Transactions table with ReferenceIndex, GatewayTxIndex, and UserIdIndex GSIs projecting ALL', () => {
    const template = synthDataStack();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Transactions',
      KeySchema: [{ AttributeName: 'transactionId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'ReferenceIndex',
          KeySchema: [{ AttributeName: 'reference', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        }),
        Match.objectLike({
          IndexName: 'GatewayTxIndex',
          KeySchema: [{ AttributeName: 'gatewayTransactionId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        }),
        Match.objectLike({
          IndexName: 'UserIdIndex',
          KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
    });
  });

  it('creates the Users table with an EmailIndex GSI projecting ALL', () => {
    const template = synthDataStack();

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Users',
      KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'EmailIndex',
          KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
    });
  });

  it('keeps the Transactions table additive: unchanged partition key and no removal of existing GSIs when UserIdIndex is added', () => {
    const template = synthDataStack();
    const resources = template.findResources('AWS::DynamoDB::Table', {
      Properties: { TableName: 'Transactions' },
    });
    const [, transactionsTable] = Object.entries(resources)[0];
    const gsiNames = (
      transactionsTable.Properties.GlobalSecondaryIndexes as Array<{ IndexName: string }>
    ).map((gsi) => gsi.IndexName);

    // Additive-only assertion: partition key is still solely transactionId (no
    // composite/replacement key change), and all 3 GSIs (the 2 pre-existing
    // ones plus the new UserIdIndex) coexist — none were dropped to make room.
    expect(transactionsTable.Properties.KeySchema).toEqual([
      { AttributeName: 'transactionId', KeyType: 'HASH' },
    ]);
    expect(gsiNames.sort()).toEqual(['GatewayTxIndex', 'ReferenceIndex', 'UserIdIndex'].sort());
    // DeletionPolicy/UpdateReplacePolicy 'Delete' here reflects RemovalPolicy.DESTROY
    // (a demo-stack choice, see class doc), not a resource replacement signal —
    // real replacement risk is CloudFormation replacing the table because a
    // key-schema attribute changed, which the KeySchema assertion above rules out.
    template.hasResource('AWS::DynamoDB::Table', {
      Properties: Match.objectLike({ TableName: 'Transactions' }),
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  it('sets RemovalPolicy DESTROY (DeletionPolicy Delete) on every table', () => {
    const template = synthDataStack();

    template.allResources('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });
});
