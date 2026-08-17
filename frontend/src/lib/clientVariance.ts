function hashClientId(clientId: string): number {
  let hash = 0;
  for (let index = 0; index < clientId.length; index += 1) {
    hash = (hash * 31 + clientId.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** Deterministic per-client multiplier for quantity-like mock values, so demo data visibly differs by client. */
export function clientVarianceFactor(clientId: string | null | undefined, spread = 0.35): number {
  if (!clientId) return 1;
  const normalized = (hashClientId(clientId) % 1000) / 1000;
  return 1 - spread + normalized * (spread * 2);
}

export function scaleQty(value: number, clientId: string | null | undefined, spread = 0.35): number {
  return Math.round(value * clientVarianceFactor(clientId, spread));
}

/** Deterministic per-client offset for percentage-like mock values, clamped to a sane range. */
export function scalePercent(value: number, clientId: string | null | undefined, spread = 6, min = 1, max = 99): number {
  if (!clientId) return value;
  const normalized = (hashClientId(clientId + ':pct') % 1000) / 1000;
  const offset = Math.round((normalized * 2 - 1) * spread);
  return Math.min(max, Math.max(min, value + offset));
}
