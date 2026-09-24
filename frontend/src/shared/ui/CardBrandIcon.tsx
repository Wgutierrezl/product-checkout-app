import type { CardBrand } from '../../domain/card/brand';

export interface CardBrandIconProps {
  brand: CardBrand;
}

/**
 * Small, original inline SVG marks (not traced from any real artwork) used
 * purely to help the buyer confirm which brand was detected from their card
 * number. Inline JSX SVG — no `<img>` fetch to a third party, no
 * `dangerouslySetInnerHTML` — keeps this CSP-friendly and dependency-free.
 */
function VisaMark() {
  return (
    <svg width={40} height={26} viewBox="0 0 40 26" role="img" aria-label="Visa">
      <rect width="40" height="26" rx="4" fill="#1f4e8c" />
      <text
        x="20"
        y="17.5"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontStyle="italic"
        fontWeight="700"
        fontSize="10"
        fill="#ffffff"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardMark() {
  return (
    <svg width={40} height={26} viewBox="0 0 40 26" role="img" aria-label="Mastercard">
      <rect width="40" height="26" rx="4" fill="#2b2622" />
      <circle cx="16" cy="13" r="7.5" fill="#eb6f3b" />
      <circle cx="24" cy="13" r="7.5" fill="#f2b705" fillOpacity="0.9" />
    </svg>
  );
}

/** Renders nothing for `'unknown'` — callers decide what to show instead (e.g. an inline message). */
export function CardBrandIcon({ brand }: CardBrandIconProps) {
  if (brand === 'visa') {
    return <VisaMark />;
  }
  if (brand === 'mastercard') {
    return <MastercardMark />;
  }
  return null;
}
