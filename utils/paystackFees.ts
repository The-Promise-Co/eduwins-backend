/**
 * Paystack processing-fee handling.
 *
 * Platform policy: fees are borne by the customer, but they are NOT added
 * to the amount we send to Paystack. The dashboard "Pass fees to customers"
 * setting makes Paystack calculate and add the real fee at checkout, and
 * Paystack retains that fee while the merchant receives the cost we listed.
 *
 * We still estimate the fee here purely for UI display (quote rows and the
 * Pay button show cost + estimated fee). The amount initialized with
 * Paystack is always the bare cost. Settlement never calculates: it
 * subtracts Paystack's returned fee from the charged figure and splits
 * that actual amount.
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

/** Display estimate of what the customer pays at checkout: total + fee. */
export function chargeTotalWithFee(totalNaira: number): number {
  return totalNaira + calculatePaystackFee(totalNaira);
}
