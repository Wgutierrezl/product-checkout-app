import { Global, Module } from '@nestjs/common';

import { dynamoDocumentClientProvider } from './dynamo-client.provider';

/**
 * Global module so `DYNAMO_DOCUMENT_CLIENT` is injectable from any feature
 * module (products/customers/deliveries/transactions) without each of them
 * re-declaring or re-importing the provider.
 */
@Global()
@Module({
  providers: [dynamoDocumentClientProvider],
  exports: [dynamoDocumentClientProvider],
})
export class DynamoModule {}
