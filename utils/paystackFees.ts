/**
 * Paystack processing-fee handling.
 *
 * Platform policy: fees are pushed to the customer. The parent is charged
 * `total + fee`, so the merchant always nets the full booking total and
 * splits are computed on that exact figure (no net-vs-gross ambiguity).
 *
 * Formula mirrors Paystack NG local-card pricing (1.5% + ₦100, capped at
 * ₦2,000). Card type is unknowable upfront; residual variance on
 * international cards is absorbed by the platform and documented in the
 * transaction metadata (actual fee from the payload is ground truth).
 */

export const PAYSTACK_FEE_RATE = 0.015;
export const PAYSTACK_FEE_FLAT_NAIRA = 100;
export const PAYSTACK_FEE_CAP_NAIRA = 2000;

/** Whole-naira processing fee for a given booking total. */
export function calculatePaystackFee(totalNaira: number): number {
  if (!Number.isFinite(totalNaira) || totalNaira <= 0) return 0;
  const fee = Math.ceil(totalNaira * PAYSTACK_FEE_RATE) + PAYSTACK_FEE_FLAT_NAIRA;
  return Math.min(fee, PAYSTACK_FEE_CAP_NAIRA);
}

/** Full amount the customer is charged: total + fee. */
export function chargeTotalWithFee(totalNaira: number): number {
  return totalNaira + calculatePaystackFee(totalNaira);
}
