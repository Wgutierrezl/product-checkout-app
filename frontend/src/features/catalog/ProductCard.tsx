import { useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { formatCOP } from '../../domain/money/formatCOP';
import { clampQuantity, maxSelectableQuantity } from '../../domain/catalog/quantityBounds';
import type { Product } from '../../api/types';
import styles from './ProductCard.module.css';

export interface ProductCardProps {
  product: Product;
  onBuy: (productId: string, quantity: number) => void;
}

/** A single product: image, copy, stock badge, quantity stepper, and a buy action. */
export function ProductCard({ product, onBuy }: ProductCardProps) {
  const inStock = product.stock > 0;
  const [quantity, setQuantity] = useState(() => clampQuantity(1, product.stock));
  const max = maxSelectableQuantity(product.stock);

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
          loading="lazy"
        />
      </div>

      <h3 className={styles.name}>{product.name}</h3>
      <p className={styles.description}>{product.description}</p>

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
        <span className={styles.quantityValue} aria-label="Quantity">
          {quantity}
        </span>
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
    </article>
  );
}
