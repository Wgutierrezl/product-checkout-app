import { Money } from './value-objects/money.vo';
import { Quantity } from './value-objects/quantity.vo';

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly price: Money;
  readonly stock: Quantity;
  readonly imageUrl: string;
}
