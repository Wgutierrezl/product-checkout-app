import { Inject, Injectable } from '@nestjs/common';
import { Result, ResultAsync } from 'neverthrow';

import { Delivery, DeliveryStatus } from '../../deliveries/domain/delivery.entity';
import { DELIVERY_REPOSITORY_PORT, DeliveryRepositoryPort } from '../../deliveries/domain/delivery.repository.port';
import { PRODUCT_REPOSITORY_PORT, ProductRepositoryPort } from '../../products/domain/product.repository.port';
import { withConcurrencyLimit } from '../../shared/concurrency/with-concurrency-limit';
import { DomainError } from '../../shared/errors/domain-error';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { Transaction } from '../../transactions/domain/transaction.entity';
import { TransactionStatus } from '../../transactions/domain/transaction-status.vo';
import {
  TRANSACTION_REPOSITORY_PORT,
  TransactionRepositoryPort,
} from '../../transactions/domain/transaction.repository.port';

export interface TransactionHistoryDelivery {
  address: string;
  city: string;
  region: string;
  postalCode?: string;
  status: DeliveryStatus;
}

export interface TransactionHistoryItem {
  transactionId: string;
  productId: string;
  /** `undefined` when the product no longer exists — never fails the whole list over one deleted product. */
  productName?: string;
  /** Total charged, in integer cents (same unit as `TransactionResponseDto.total`). */
  amount: number;
  status: TransactionStatus;
  createdAt: string;
  /** Present only once the transaction is APPROVED (a delivery is created at settlement time). Full, unmasked address — the caller is the owner. */
  delivery?: TransactionHistoryDelivery;
}

/**
 * The real product catalog is tiny (a handful of SKUs) compared to the up-
 * to-50 transactions in a history page, so most transactions share a
 * product — deduplicating avoids up to 50 redundant, identical
 * `findById` calls for the same handful of ids.
 */
function uniqueProductIds(transactions: readonly Transaction[]): string[] {
  return [...new Set(transactions.map((transaction) => transaction.productId))];
}

/**
 * Unlike products, deliveries have no natural dedup key (at most one per
 * transaction) and no `BatchGetItem`-friendly lookup (they're found via the
 * `TransactionIdIndex` GSI, not the table's primary key) — so this bounds
 * the number of CONCURRENT lookups instead, rather than firing up to 50 at
 * once.
 */
const DELIVERY_LOOKUP_CONCURRENCY = 10;

/**
 * `GET /me/transactions`: joins the authenticated user's transactions
 * (via `TransactionRepositoryPort.findByUserId`, already newest-first and
 * capped) with each one's product name (deduplicated per unique product id)
 * and delivery (fetched with bounded concurrency).
 */
@Injectable()
export class ListMyTransactionsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY_PORT) private readonly transactions: TransactionRepositoryPort,
    @Inject(PRODUCT_REPOSITORY_PORT) private readonly products: ProductRepositoryPort,
    @Inject(DELIVERY_REPOSITORY_PORT) private readonly deliveries: DeliveryRepositoryPort,
  ) {}

  execute(userId: string): AppResultAsync<TransactionHistoryItem[]> {
    return this.transactions.findByUserId(userId).andThen((list) => this.buildHistoryItems(list));
  }

  private buildHistoryItems(transactions: Transaction[]): AppResultAsync<TransactionHistoryItem[]> {
    return ResultAsync.fromSafePromise(this.fetchProductNamesById(transactions)).andThen((productNamesById) =>
      ResultAsync.fromSafePromise(this.fetchDeliveryResults(transactions)).andThen((deliveryResults) => {
        const combinedDeliveries = Result.combine(deliveryResults);
        if (combinedDeliveries.isErr()) {
          return errAsync(combinedDeliveries.error);
        }

        const items = transactions.map((transaction, index) =>
          this.toHistoryItem(transaction, productNamesById.get(transaction.productId), combinedDeliveries.value[index]),
        );
        return okAsync(items);
      }),
    );
  }

  /**
   * One `findById` call per UNIQUE product id (never one per transaction).
   * A deleted/unknown product degrades to `undefined` in the map — never
   * fails the whole purchase history over one missing product.
   */
  private async fetchProductNamesById(transactions: Transaction[]): Promise<Map<string, string | undefined>> {
    const ids = uniqueProductIds(transactions);
    const entries = await Promise.all(
      ids.map(async (productId): Promise<[string, string | undefined]> => {
        const result = await this.products.findById(productId);
        return [productId, result.isOk() ? result.value.name : undefined];
      }),
    );
    return new Map(entries);
  }

  /**
   * Bounded-concurrency fan-out (`DELIVERY_LOOKUP_CONCURRENCY`) — unlike
   * product lookups, a real DB error here is NOT swallowed; it propagates
   * via `Result.combine` in `buildHistoryItems`.
   */
  private fetchDeliveryResults(
    transactions: Transaction[],
  ): Promise<Array<Result<Delivery | null, DomainError>>> {
    return withConcurrencyLimit(transactions, DELIVERY_LOOKUP_CONCURRENCY, (transaction) =>
      this.deliveries.findByTransactionId(transaction.id),
    );
  }

  private toHistoryItem(
    transaction: Transaction,
    productName: string | undefined,
    delivery: Delivery | null,
  ): TransactionHistoryItem {
    return {
      transactionId: transaction.id,
      productId: transaction.productId,
      productName,
      amount: transaction.totalAmount.valueInCents,
      status: transaction.status,
      createdAt: transaction.createdAt,
      delivery: delivery
        ? {
            address: delivery.address,
            city: delivery.city,
            region: delivery.region,
            postalCode: delivery.postalCode,
            status: delivery.status,
          }
        : undefined,
    };
  }
}
