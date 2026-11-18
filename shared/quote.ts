const UNIT_FACTORS = [1, 60, 1 / 60, 100, 0.01, 1000, 0.001, 12, 1 / 12, 52];

/** True when a number in the passage equals the value, directly or by a common unit change. */
export function quoteSupportsValue(quote: string, value: number): boolean {
  const found = quote.replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?/g);
  if (!found) return false;
  return found.some((token) => {
    const n = Number(token);
    return UNIT_FACTORS.some((f) => {
      const target = n * f;
      return (
        Math.abs(target - value) <= Math.max(0.005 * Math.abs(value), 1e-9)
      );
    });
  });
}
