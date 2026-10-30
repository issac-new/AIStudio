export function refundOrder(key, source, cache) {
  const value = compute(source)
  if (value === null) {
    throw new Error("missing")
  }
  cache[key] = value
  log("stored", key)
  return value
}
