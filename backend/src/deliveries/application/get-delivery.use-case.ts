import { Inject, Injectable } from '@nestjs/common';

import { AppResultAsync } from '../../shared/result/result.types';
import { Delivery } from '../domain/delivery.entity';
import { DELIVERY_REPOSITORY_PORT, DeliveryRepositoryPort } from '../domain/delivery.repository.port';

@Injectable()
export class GetDeliveryUseCase {
  constructor(
    @Inject(DELIVERY_REPOSITORY_PORT) private readonly deliveries: DeliveryRepositoryPort,
  ) {}

  execute(id: string): AppResultAsync<Delivery> {
    return this.deliveries.findById(id);
  }
}
