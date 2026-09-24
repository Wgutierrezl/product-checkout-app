import { useEffect, useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { formatCOP } from '../../domain/money/formatCOP';
import { clampQuantity, maxSelectableQuantity } from '../../domain/catalog/quantityBounds';
import type { Product } from '../../api/types';
import styles from './ProductCard.module.css';

export interface ProductCardProps {
  product: Product;
  onBuy: (productId: string, quantity: number) => void;
  /** Marks this card's image as the Largest Contentful Paint candidate (first card in the grid). */
  priority?: boolean;
}

/** A single product: image, copy, stock badge, quantity stepper, and a buy action. */
export function ProductCard({ product, onBuy, priority = false }: ProductCardProps) {
  const inStock = product.stock > 0;
  const [quantity, setQuantity] = useState(() => clampQuantity(1, product.stock));
  const max = maxSelectableQuantity(product.stock);

  // A re-fetched catalog can lower `product.stock` for the SAME product id
  // (same React key, same ProductCard instance) — the buyer's previously
  // selected quantity must never be left stranded above the new stock.
  useEffect(() => {
    setQuantity((current) => clampQuantity(current, product.stock));
  }, [product.stock]);

  const decrease = () => setQuantity((current) => clampQuantity(current - 1, product.stock));
  const increase = () => setQuantity((current) => clampQuantity(current + 1, product.stock));

  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        <img
          className={styles.image}
          src={product.imageUrl}
          alt={product.name}
          width={320}
          height={320}
          loading={priority ? 'eager' : 'lazy'}
          {...(priority ? { fetchpriority: 'high' } : {})}
        />
      </div>

      <h3 className={styles.name}>{product.name}</h3>
      <p className={styles.description}>{product.description}</p>

      {/* Pinned to the bottom of the card (margin-top: auto) so every card in a
          grid row lines up its price/stock, stepper, and pay action at the
          same baseline regardless of how many lines the name/description
          above happen to wrap to. */}
      <div className={styles.footer} data-testid="product-card-footer">
        <div className={styles.meta}>
          <span className={styles.price}>{formatCOP(product.price)}</span>
          <span className={inStock ? styles.badgeInStock : styles.badgeOutOfStock}>
            {inStock ? `${product.stock} in stock` : 'Out of stock'}
          </span>
        </div>

        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepperButton}
            aria-label="Decrease quantity"
            onClick={decrease}
            disabled={!inStock || quantity <= 1}
          >
            −
          </button>
          <output className={styles.quantityValue} aria-label="Quantity" aria-live="polite">
            {quantity}
          </output>
          <button
            type="button"
            className={styles.stepperButton}
            aria-label="Increase quantity"
            onClick={increase}
            disabled={!inStock || quantity >= max}
          >
            +
          </button>
        </div>

        <div className={styles.actions}>
          <Button
            className={styles.payButton}
            disabled={!inStock}
            onClick={() => onBuy(product.id, quantity)}
          >
            Pay with credit card
          </Button>
        </div>
      </div>
    </article>
  );
}
