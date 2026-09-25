import { useState } from 'react';
import { ProductListContainer } from '../features/catalog/ProductListContainer';
import { PaymentModalContainer } from '../features/checkout/PaymentModalContainer';
import { SummaryContainer } from '../features/checkout/SummaryContainer';
import { useResumeInFlightPayment } from '../features/checkout/useResumeInFlightPayment';
import { ResultContainer } from '../features/transaction/ResultContainer';
import { AuthModalContainer } from '../features/auth/AuthModalContainer';
import { HeaderAccountMenu, type AuthView } from '../features/auth/HeaderAccountMenu';
import { useAppSelector } from './hooks';
import styles from './App.module.css';

const STORE_NAME = 'Lumila';

/**
 * `authView` is a small piece of LOCAL component state, not Redux — it only
 * ever controls which auth screen (if any) is showing, has zero bearing on
 * `CheckoutState`/`CheckoutStep`, and never persists. This is the
 * "lightweight view state for auth screens, no router" from the design.
 */
export function App() {
  useResumeInFlightPayment();
  const step = useAppSelector((state) => state.checkout.step);
  const [authView, setAuthView] = useState<AuthView | null>(null);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.brand}>{STORE_NAME}</h1>
        <HeaderAccountMenu onOpenAuth={setAuthView} />
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
      {authView && <AuthModalContainer view={authView} onClose={() => setAuthView(null)} />}
    </div>
  );
}
