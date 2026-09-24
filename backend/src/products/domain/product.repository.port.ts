import { AppResultAsync } from '../../shared/result/result.types';
import { Product } from './product.entity';

export interface ProductRepositoryPort {
  findAll(): AppResultAsync<Product[]>;
  findById(id: string): AppResultAsync<Product>;
}

export const PRODUCT_REPOSITORY_PORT = Symbol('PRODUCT_REPOSITORY_PORT');
