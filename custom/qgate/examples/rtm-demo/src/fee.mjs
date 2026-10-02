export function calcFee(amount) {
  if (!(amount > 0)) return 0
  return Math.min(amount * 0.02, 100)
}
