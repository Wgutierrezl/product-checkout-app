import styles from './SandboxTestCardsHelper.module.css';

/**
 * The gateway's sandbox only accepts these two PANs (verified against the
 * real sandbox) — any other number, even a standard test number from
 * another network's docs, is rejected at tokenization. Kept here as the
 * single source of truth so `PaymentForm` never hardcodes them inline.
 */
const SANDBOX_TEST_CARDS = [
  {
    id: 'approved',
    number: '4242424242424242',
    displayNumber: '4242 4242 4242 4242',
    outcome: 'approved',
  },
  {
    id: 'declined',
    number: '4111111111111111',
    displayNumber: '4111 1111 1111 1111',
    outcome: 'declined',
  },
] as const;

export interface SandboxTestCardsHelperProps {
  /** Called with the RAW (unformatted) digits of the chosen test card. */
  onUseCard: (cardNumber: string) => void;
}

/**
 * Compact, accessible helper shown only in sandbox/test mode (see
 * `PaymentForm`'s `isSandbox` check), just below the card number field, so
 * reviewers who don't know the gateway's sandbox restrictions can still
 * complete a payment.
 */
export function SandboxTestCardsHelper({ onUseCard }: SandboxTestCardsHelperProps) {
  return (
    <div className={styles.helper} role="group" aria-labelledby="sandbox-test-cards-title">
      <p id="sandbox-test-cards-title" className={styles.title}>
        Sandbox mode — use a test card
      </p>
      <ul className={styles.list}>
        {SANDBOX_TEST_CARDS.map((card) => (
          <li key={card.id} className={styles.row}>
            <span className={styles.cardText}>
              {card.displayNumber} — {card.outcome}
            </span>
            <button
              type="button"
              className={styles.useButton}
              aria-label={`Use ${card.outcome} test card`}
              onClick={() => onUseCard(card.number)}
            >
              Use
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.footnote}>Any future expiry date · CVC 123</p>
    </div>
  );
}
