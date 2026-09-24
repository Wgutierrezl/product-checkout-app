import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export const PRODUCTS_TABLE_NAME = 'Products';
export const CUSTOMERS_TABLE_NAME = 'Customers';
export const DELIVERIES_TABLE_NAME = 'Deliveries';
export const TRANSACTIONS_TABLE_NAME = 'Transactions';

export const CUSTOMERS_EMAIL_INDEX_NAME = 'EmailIndex';
export const DELIVERIES_TRANSACTION_ID_INDEX_NAME = 'TransactionIdIndex';
export const TRANSACTIONS_REFERENCE_INDEX_NAME = 'ReferenceIndex';
export const TRANSACTIONS_GATEWAY_TX_INDEX_NAME = 'GatewayTxIndex';

/**
 * Provisions the 4 DynamoDB tables backing the checkout app, matching the
 * key schemas and GSIs used by `backend/scripts/seed-products.ts` and the
 * backend's Dynamo repositories exactly. PAY_PER_REQUEST billing (no
 * capacity planning needed for a demo workload) and RemovalPolicy.DESTROY
 * (this is a demo stack — no data retention guarantees on `cdk destroy`).
 */
export class DataStack extends Stack {
  public readonly productsTable: Table;
  public readonly customersTable: Table;
  public readonly deliveriesTable: Table;
  public readonly transactionsTable: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.productsTable = new Table(this, 'ProductsTable', {
      tableName: PRODUCTS_TABLE_NAME,
      partitionKey: { name: 'productId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.customersTable = new Table(this, 'CustomersTable', {
      tableName: CUSTOMERS_TABLE_NAME,
      partitionKey: { name: 'customerId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.customersTable.addGlobalSecondaryIndex({
      indexName: CUSTOMERS_EMAIL_INDEX_NAME,
      partitionKey: { name: 'email', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.deliveriesTable = new Table(this, 'DeliveriesTable', {
      tableName: DELIVERIES_TABLE_NAME,
      partitionKey: { name: 'deliveryId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.deliveriesTable.addGlobalSecondaryIndex({
      indexName: DELIVERIES_TRANSACTION_ID_INDEX_NAME,
      partitionKey: { name: 'transactionId', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.transactionsTable = new Table(this, 'TransactionsTable', {
      tableName: TRANSACTIONS_TABLE_NAME,
      partitionKey: { name: 'transactionId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.transactionsTable.addGlobalSecondaryIndex({
      indexName: TRANSACTIONS_REFERENCE_INDEX_NAME,
      partitionKey: { name: 'reference', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.transactionsTable.addGlobalSecondaryIndex({
      indexName: TRANSACTIONS_GATEWAY_TX_INDEX_NAME,
      partitionKey: { name: 'gatewayTransactionId', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
  }
}
