import { Module } from '@nestjs/common';

import { GetDeliveryUseCase } from './application/get-delivery.use-case';
import { DELIVERY_REPOSITORY_PORT } from './domain/delivery.repository.port';
import { DynamoDeliveryRepository } from './infrastructure/dynamo-delivery.repository';
import { DeliveriesController } from './infrastructure/deliveries.controller';

@Module({
  controllers: [DeliveriesController],
  providers: [
    GetDeliveryUseCase,
    { provide: DELIVERY_REPOSITORY_PORT, useClass: DynamoDeliveryRepository },
  ],
  exports: [DELIVERY_REPOSITORY_PORT],
})
export class DeliveriesModule {}
