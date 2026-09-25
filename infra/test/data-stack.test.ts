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
  it('provisions exactly 4 DynamoDB tables with PAY_PER_REQUEST billing', () => {
    const template = synthDataStack();

    template.resourceCountIs('AWS::DynamoDB::Table', 4);
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

  it('creates the Transactions table with ReferenceIndex and GatewayTxIndex GSIs projecting ALL', () => {
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
      ]),
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
