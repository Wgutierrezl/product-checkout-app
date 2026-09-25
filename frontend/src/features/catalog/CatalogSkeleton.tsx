import styles from './CatalogSkeleton.module.css';

export interface CatalogSkeletonProps {
  count?: number;
}

/** Placeholder cards shown while the catalog is loading, with an accessible loading announcement. */
export function CatalogSkeleton({ count = 12 }: CatalogSkeletonProps) {
  return (
    <div>
      <p role="status" className={styles.visuallyHidden}>
        Loading products
      </p>
      <div className={styles.grid}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className={styles.placeholder} aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}
