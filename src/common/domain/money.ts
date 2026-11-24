/**
 * NPR amounts travel as numbers with at most 2 decimals. Arithmetic is done in
 * integer paisa so that, e.g., 0.1 + 0.2 is exactly 0.3.
 */
export function toPaisa(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new RangeError('Amount must be finite');
  return Math.round(rupees * 100);
}

export const fromPaisa = (paisa: number): number => paisa / 100;

export function addRupees(...amounts: number[]): number {
  return fromPaisa(amounts.reduce((sum, amount) => sum + toPaisa(amount), 0));
}
