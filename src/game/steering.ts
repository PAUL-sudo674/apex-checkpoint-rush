export const WHEEL_LIMIT = 110;
export const clampWheel = (angle: number) => Math.max(-WHEEL_LIMIT, Math.min(WHEEL_LIMIT, angle));
export const wheelSteer = (angle: number) => clampWheel(angle) / WHEEL_LIMIT;
export function easeWheel(angle: number, target: number, dt: number) {
  const next = angle + (target - angle) * (1 - Math.exp(-14 * Math.max(0, dt)));
  return Math.abs(next - target) < 0.05 ? target : next;
}
export function angularDelta(previous: number, next: number) {
  return Math.atan2(Math.sin(next - previous), Math.cos(next - previous)) * 180 / Math.PI;
}