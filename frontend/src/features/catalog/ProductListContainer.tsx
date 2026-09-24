import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { fetchProducts } from './catalogThunks';
import { productSelected, stepChangeRequested } from '../checkout/checkoutSlice';
import { ProductGrid } from './ProductGrid';
import { CatalogSkeleton } from './CatalogSkeleton';
import { resolveErrorMessage } from './resolveErrorMessage';
import { Button } from '../../shared/ui/Button';
import styles from './ProductListContainer.module.css';

/** Connects the catalog + checkout slices to the presentational catalog UI. */
export function ProductListContainer() {
  const dispatch = useAppDispatch();
  const { items, status, error } = useAppSelector((state) => state.catalog);

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);

  function handleBuy(productId: string, quantity: number) {
    dispatch(productSelected({ productId, quantity }));
    dispatch(stepChangeRequested('DETAILS'));
  }

  function handleRetry() {
    dispatch(fetchProducts());
  }

  function renderContent() {
    if (status === 'idle' || status === 'loading') {
      return <CatalogSkeleton />;
    }

    if (status === 'failed') {
      return (
        <div role="alert" className={styles.errorState}>
          <p>{resolveErrorMessage(error)}</p>
          <Button onClick={handleRetry}>Retry</Button>
        </div>
      );
    }

    if (items.length === 0) {
      return <p className={styles.emptyState}>No products available right now.</p>;
    }

    return <ProductGrid products={items} onBuy={handleBuy} />;
  }

  return (
    <section aria-labelledby="catalog-heading">
      <h2 id="catalog-heading" className={styles.visuallyHidden}>
        Products
      </h2>
      {renderContent()}
    </section>
  );
}
