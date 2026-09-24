import { ProductCard } from './ProductCard';
import type { Product } from '../../api/types';
import styles from './ProductGrid.module.css';

export interface ProductGridProps {
  products: Product[];
  onBuy: (productId: string, quantity: number) => void;
}

/** Responsive grid of products: 1 column on mobile, 2 on tablet, 3 on desktop. */
export function ProductGrid({ products, onBuy }: ProductGridProps) {
  return (
    <ul className={styles.grid}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} onBuy={onBuy} />
        </li>
      ))}
    </ul>
  );
}
