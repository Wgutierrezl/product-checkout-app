import { ProductCard } from './ProductCard';
import type { Product } from '../../api/types';
import styles from './ProductGrid.module.css';

export interface ProductGridProps {
  products: Product[];
  onBuy: (productId: string, quantity: number) => void;
}

/**
 * Cards in the widest first row (4 columns from 1280px, see ProductGrid.module.css)
 * are above the fold on desktop, so their images must not wait for lazy loading.
 */
const EAGER_IMAGE_COUNT = 4;

/** Responsive grid of products: 1 column on mobile, 2 on tablet, 3 on desktop, 4 on wide desktop. */
export function ProductGrid({ products, onBuy }: ProductGridProps) {
  return (
    <ul className={styles.grid}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            onBuy={onBuy}
            priority={index === 0}
            eager={index < EAGER_IMAGE_COUNT}
          />
        </li>
      ))}
    </ul>
  );
}
