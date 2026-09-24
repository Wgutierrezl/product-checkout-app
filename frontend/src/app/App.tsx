import { ProductListContainer } from '../features/catalog/ProductListContainer';
import { PaymentModalContainer } from '../features/checkout/PaymentModalContainer';
import { useAppSelector } from './hooks';
import styles from './App.module.css';

const STORE_NAME = 'Meridian Goods';

export function App() {
  const step = useAppSelector((state) => state.checkout.step);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.brand}>{STORE_NAME}</h1>
      </header>
      <main className={styles.main}>
        <ProductListContainer />
      </main>
      {step === 'DETAILS' && <PaymentModalContainer />}
    </div>
  );
}
