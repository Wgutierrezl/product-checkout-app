import { ProductListContainer } from '../features/catalog/ProductListContainer';
import { PaymentModalContainer } from '../features/checkout/PaymentModalContainer';
import { SummaryContainer } from '../features/checkout/SummaryContainer';
import { useResumeInFlightPayment } from '../features/checkout/useResumeInFlightPayment';
import { ResultContainer } from '../features/transaction/ResultContainer';
import { useAppSelector } from './hooks';
import styles from './App.module.css';

const STORE_NAME = 'Meridian Goods';

export function App() {
  useResumeInFlightPayment();
  const step = useAppSelector((state) => state.checkout.step);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.brand}>{STORE_NAME}</h1>
      </header>
      <main className={styles.main}>
        <ProductListContainer />
      </main>
      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} {STORE_NAME}. We never store your card details.</p>
      </footer>
      {step === 'DETAILS' && <PaymentModalContainer />}
      {step === 'SUMMARY' && <SummaryContainer />}
      {step === 'RESULT' && <ResultContainer />}
    </div>
  );
}
