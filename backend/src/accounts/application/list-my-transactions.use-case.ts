import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';

import { DeliveryStatus } from '../../deliveries/domain/delivery.entity';
import { DELIVERY_REPOSITORY_PORT, DeliveryRepositoryPort } from '../../deliveries/domain/delivery.repository.port';
import { PRODUCT_REPOSITORY_PORT, ProductRepositoryPort } from '../../products/domain/product.repository.port';
import { AppResultAsync, okAsync } from '../../shared/result/result.types';
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
 * `GET /me/transactions`: joins the authenticated user's transactions
 * (via `TransactionRepositoryPort.findByUserId`, already newest-first and
 * capped) with each one's product name and delivery, both fetched
 * best-effort per transaction — see `toHistoryItem`.
 */
@Injectable()
export class ListMyTransactionsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY_PORT) private readonly transactions: TransactionRepositoryPort,
    @Inject(PRODUCT_REPOSITORY_PORT) private readonly products: ProductRepositoryPort,
    @Inject(DELIVERY_REPOSITORY_PORT) private readonly deliveries: DeliveryRepositoryPort,
  ) {}

  execute(userId: string): AppResultAsync<TransactionHistoryItem[]> {
    return this.transactions
      .findByUserId(userId)
      .andThen((list) => ResultAsync.combine(list.map((transaction) => this.toHistoryItem(transaction))));
  }

  private toHistoryItem(transaction: Transaction): AppResultAsync<TransactionHistoryItem> {
    return ResultAsync.combine([this.lookupProductName(transaction.productId), this.deliveries.findByTransactionId(transaction.id)]).map(
      ([productName, delivery]) => ({
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
      }),
    );
  }

  /**
   * A deleted/unknown product must never fail the whole purchase history —
   * degrades to `undefined` instead of propagating `NotFoundError`.
   */
  private lookupProductName(productId: string): AppResultAsync<string | undefined> {
    return this.products
      .findById(productId)
      .map((product) => product.name)
      .orElse(() => okAsync(undefined));
  }
}
