import { ProductListContainer } from '../features/catalog/ProductListContainer';
import styles from './App.module.css';

const STORE_NAME = 'Meridian Goods';

export function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.brand}>{STORE_NAME}</h1>
      </header>
      <main className={styles.main}>
        <ProductListContainer />
      </main>
    </div>
  );
}
