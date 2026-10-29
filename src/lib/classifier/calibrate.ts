import { INPUT_CATEGORIES, emptyCounts, sumCounts, type InputCounts } from "./types";

/**
 * Fit local category counts to the provider input total.
 * A shortfall of at most 5% is overhead. A surplus, or a gap above 5%,
 * is spread with largest-remainder rounding in category order.
 */
export function calibrate(raw: InputCounts, target: number): { counts: InputCounts; estimated: boolean } {
  const localSum = sumCounts(raw);

  if (target === 0) {
    return { counts: emptyCounts(), estimated: localSum > 0 };
  }

  const estimated = Math.abs(localSum - target) * 20 > target;

  if (localSum === 0) {
    const counts = emptyCounts();
    counts.overhead = target;
    return { counts, estimated: true };
  }

  if (localSum < target && !estimated) {
    const counts = { ...raw };
    counts.overhead += target - localSum;
    return { counts, estimated: false };
  }

  if (localSum === target) {
    return { counts: { ...raw }, estimated: false };
  }

  return { counts: scaleCounts(raw, localSum, target), estimated };
}

function scaleCounts(raw: InputCounts, localSum: number, target: number): InputCounts {
  const floors: number[] = [];
  const remainders: number[] = [];

  for (const category of INPUT_CATEGORIES) {
    const product = raw[category] * target;
    floors.push(Math.floor(product / localSum));
    remainders.push(product % localSum);
  }

  let leftover = target - floors.reduce((total, value) => total + value, 0);
  const order = INPUT_CATEGORIES.map((_, index) => index).sort((left, right) => {
    const byRemainder = (remainders[right] ?? 0) - (remainders[left] ?? 0);
    if (byRemainder !== 0) return byRemainder;
    return left - right;
  });

  for (const index of order) {
    if (leftover === 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    leftover -= 1;
  }

  if (leftover !== 0) {
    throw new Error("Calibrated counts do not match input_tokens");
  }

  const scaled = emptyCounts();
  INPUT_CATEGORIES.forEach((category, index) => {
    scaled[category] = floors[index] ?? 0;
  });
  return scaled;
}
