import { Money } from './value-objects/money.vo';
import { Stock } from './value-objects/stock.vo';

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly price: Money;
  readonly stock: Stock;
  readonly imageUrl: string;
}
