import { CatmullRomCurve3, Vector3 } from "three";

const CTRL: [number, number][] = [
  [0, 0], [100, 0], [170, 30], [190, 100], [150, 150], [80, 140], [40, 180],
  [60, 240], [0, 280], [-90, 260], [-130, 190], [-110, 110], [-150, 50], [-90, 0],
];
const SCALE = 1.6;

export const N = 800;
export const HALF = 7; // road half width (m)

export type TrackPoint = { x: number; z: number; tx: number; tz: number; nx: number; nz: number; d: number };

function build() {
  const curve = new CatmullRomCurve3(
    CTRL.map(([x, z]) => new Vector3(x * SCALE, 0, z * SCALE)),
    true,
    "centripetal",
  );
  const pts: TrackPoint[] = [];
  let d = 0;
  for (let i = 0; i < N; i++) {
    const p = curve.getPointAt(i / N);
    const t = curve.getTangentAt(i / N);
    if (i > 0) d += Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z);
    const len = Math.hypot(t.x, t.z) || 1;
    const tx = t.x / len, tz = t.z / len;
    pts.push({ x: p.x, z: p.z, tx, tz, nx: tz, nz: -tx, d });
  }
  const length = d + Math.hypot(pts[0]!.x - pts[N - 1]!.x, pts[0]!.z - pts[N - 1]!.z);
  return { pts, length };
}

export const TRACK = build();
export const CHECKPOINTS = [Math.floor(N / 4), Math.floor(N / 2), Math.floor((3 * N) / 4)];

export function nearest(x: number, z: number, from: number): number {
  let best = 0, bestD = Infinity;
  const range = from < 0 ? N / 2 : 40;
  const start = from < 0 ? 0 : from;
  for (let k = -range; k <= range; k++) {
    const i = (((start + k) % N) + N) % N;
    const p = TRACK.pts[i]!;
    const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best;
}
