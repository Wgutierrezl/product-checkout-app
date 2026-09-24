import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { IdGeneratorPort } from '../../ports/id-generator.port';

@Injectable()
export class UuidIdGeneratorAdapter implements IdGeneratorPort {
  newId(): string {
    return randomUUID();
  }

  newReference(): string {
    return `REF-${randomUUID()}`;
  }
}
