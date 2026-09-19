export const EPS = 1e-6;

export function visRange(dist: number): number {
  return dist;
}

export function lum(c: readonly [number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function mis2(a: number, b: number): number {
  const a2 = a * a;
  return a2 / (a2 + b * b);
}

export function beer(
  albedo: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.pow(Math.max(albedo[0], EPS), t),
    Math.pow(Math.max(albedo[1], EPS), t),
    Math.pow(Math.max(albedo[2], EPS), t),
  ];
}

export function iorF0(ior: number): number {
  const a = (ior - 1) / (ior + 1);
  return a * a;
}

export function lightSolidAnglePdf(areaPdf: number, dist2: number, cosLight: number): number {
  return (areaPdf * dist2) / Math.max(cosLight, EPS);
}

export function sphereSolidAnglePdf(dist2: number, radius: number): number {
  const sin2 = (radius * radius) / Math.max(dist2, EPS);
  const cosMax = Math.sqrt(Math.max(0, 1 - sin2));
  return 1 / (2 * Math.PI * Math.max(1 - cosMax, EPS));
}

export function lightPower(emission: readonly [number, number, number], area: number): number {
  return Math.max(EPS, lum(emission) * area);
}
