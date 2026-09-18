export function aliasTable(weights: ArrayLike<number>): {
  accept: Float32Array;
  alias: Uint32Array;
} {
  const n = weights.length;
  const accept = new Float32Array(n);
  const alias = new Uint32Array(n);
  if (n === 0) return { accept, alias };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.max(0, weights[i] ?? 0);
  const scaled = new Float32Array(n);
  const small: number[] = [];
  const large: number[] = [];
  const inv = n / Math.max(sum, 1e-16);
  for (let i = 0; i < n; i++) {
    const s = Math.max(0, weights[i] ?? 0) * inv;
    scaled[i] = s;
    if (s < 1) small.push(i);
    else large.push(i);
  }
  while (small.length && large.length) {
    const s = small.pop()!;
    const l = large.pop()!;
    accept[s] = scaled[s] ?? 0;
    alias[s] = l;
    const next = (scaled[l] ?? 0) + (scaled[s] ?? 0) - 1;
    scaled[l] = next;
    if (next < 1) small.push(l);
    else large.push(l);
  }
  for (const i of large) {
    accept[i] = 1;
    alias[i] = i;
  }
  for (const i of small) {
    accept[i] = 1;
    alias[i] = i;
  }
  return { accept, alias };
}
