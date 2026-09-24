/**
 * Validates a card's expiry month/year against the current month.
 * A card is valid through the LAST day of its expiry month.
 */
export function isExpiryValid(
  month: number,
  year: number,
  now: Date = new Date(),
): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return false;
  }

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year > currentYear) {
    return true;
  }

  if (year === currentYear) {
    return month >= currentMonth;
  }

  return false;
}
