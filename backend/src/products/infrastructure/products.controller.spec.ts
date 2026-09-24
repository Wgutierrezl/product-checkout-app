import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { GetProductUseCase } from '../application/get-product.use-case';
import { ListProductsUseCase } from '../application/list-products.use-case';
import { Product } from '../domain/product.entity';
import { Money } from '../domain/value-objects/money.vo';
import { Stock } from '../domain/value-objects/stock.vo';
import { ProductsController } from './products.controller';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Wireless Headphones',
    description: 'Noise-cancelling over-ear headphones',
    price: Money.create(150_000)._unsafeUnwrap(),
    stock: Stock.create(10)._unsafeUnwrap(),
    imageUrl: 'https://images.unsplash.com/photo-1',
    ...overrides,
  };
}

describe('ProductsController', () => {
  describe('list', () => {
    it('returns the mapped product DTOs', async () => {
      const listProducts = {
        execute: () => okAsync([buildProduct()]),
      } as unknown as ListProductsUseCase;
      const controller = new ProductsController(listProducts, {} as unknown as GetProductUseCase);

      const result = await controller.list();

      expect(result).toEqual([
        {
          id: 'prod-1',
          name: 'Wireless Headphones',
          description: 'Noise-cancelling over-ear headphones',
          price: 150_000,
          currency: 'COP',
          stock: 10,
          imageUrl: 'https://images.unsplash.com/photo-1',
        },
      ]);
    });

    it('includes an out-of-stock product (stock 0) via GET /products', async () => {
      const outOfStock = buildProduct({
        id: 'prod-oos',
        name: 'Sold Out Gadget',
        stock: Stock.create(0)._unsafeUnwrap(),
      });
      const listProducts = {
        execute: () => okAsync([outOfStock]),
      } as unknown as ListProductsUseCase;
      const controller = new ProductsController(listProducts, {} as unknown as GetProductUseCase);

      const result = await controller.list();

      expect(result).toEqual([expect.objectContaining({ id: 'prod-oos', stock: 0 })]);
    });

    it('throws the DomainError when the use case fails', async () => {
      const unexpected = new NotFoundError('unexpected');
      const listProducts = {
        execute: () => errAsync(unexpected),
      } as unknown as ListProductsUseCase;
      const controller = new ProductsController(listProducts, {} as unknown as GetProductUseCase);

      await expect(controller.list()).rejects.toBe(unexpected);
    });
  });

  describe('getById', () => {
    it('returns the mapped product DTO when found', async () => {
      const getProduct = { execute: () => okAsync(buildProduct()) } as unknown as GetProductUseCase;
      const controller = new ProductsController(
        {} as unknown as ListProductsUseCase,
        getProduct,
      );

      const result = await controller.getById('prod-1');

      expect(result.id).toBe('prod-1');
      expect(result.price).toBe(150_000);
      expect(result.currency).toBe('COP');
    });

    it('throws the DomainError when the product is not found', async () => {
      const notFound = new NotFoundError('Product missing-id not found');
      const getProduct = { execute: () => errAsync(notFound) } as unknown as GetProductUseCase;
      const controller = new ProductsController(
        {} as unknown as ListProductsUseCase,
        getProduct,
      );

      await expect(controller.getById('missing-id')).rejects.toBe(notFound);
    });
  });

  describe('GET /products/:id route validation (HTTP)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [ProductsController],
        providers: [
          { provide: ListProductsUseCase, useValue: { execute: () => okAsync([]) } },
          { provide: GetProductUseCase, useValue: { execute: () => okAsync(buildProduct()) } },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects a malformed (non-UUID) id with 400', async () => {
      await request(app.getHttpServer()).get('/products/not-a-uuid').expect(400);
    });

    it('accepts a well-formed UUID id', async () => {
      await request(app.getHttpServer())
        .get('/products/e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10')
        .expect(200);
    });
  });
});
