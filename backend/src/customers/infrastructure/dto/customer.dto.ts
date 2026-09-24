import { ApiProperty } from '@nestjs/swagger';

import { maskEmail, maskPhone } from '../../../shared/pii/mask-pii';
import { Customer } from '../../domain/customer.entity';

export class CustomerResponseDto {
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  id!: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName!: string;

  @ApiProperty({
    example: 'ja******@example.com',
    description:
      'Partially masked — this lookup endpoint has no auth layer, so the id is ' +
      'effectively guessable; masking limits PII exposure to third parties.',
  })
  email!: string;

  @ApiProperty({
    example: '********4567',
    description: 'Partially masked — only the last 4 digits are visible.',
  })
  phone!: string;

  static fromDomain(customer: Customer): CustomerResponseDto {
    const dto = new CustomerResponseDto();
    dto.id = customer.id;
    dto.fullName = customer.fullName;
    dto.email = maskEmail(customer.email);
    dto.phone = maskPhone(customer.phone);
    return dto;
  }
}
