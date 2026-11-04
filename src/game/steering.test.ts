import { describe, expect, it } from "vitest";
import { angularDelta, clampWheel, easeWheel, wheelSteer } from "./steering";
import { emptyInput, mergeInputs, resolveKeys } from "./input";
import { newCar, newRace, step, C } from "./sim";

describe("steering wheel", () => {
  it("maps left/right wheel rotation proportionally to bounded steering", () => {
    expect(wheelSteer(-55)).toBe(0.5);
    expect(wheelSteer(55)).toBe(-0.5);
    expect(wheelSteer(300)).toBe(-1);
    expect(clampWheel(-300)).toBe(-110);
  });
  it("smoothly returns to exactly center on release", () => {
    let angle = 110;
    angle = easeWheel(angle, 0, 1 / 60);
    expect(angle).toBeGreaterThan(0); expect(angle).toBeLessThan(110);
    for (let i = 0; i < 90; i++) angle = easeWheel(angle, 0, 1 / 60);
    expect(angle).toBe(0);
  });
  it("keeps drags continuous across the angular seam", () => {
    expect(angularDelta(179 * Math.PI / 180, -179 * Math.PI / 180)).toBeCloseTo(2);
  });
  it("merges fractional wheel steering with held pedals without losing precision", () => {
    const merged = mergeInputs(resolveKeys(new Set(["KeyW"])), { ...emptyInput(), steer: 0.25, down: true });
    expect(merged.steer).toBe(0.25); expect(merged.up).toBe(true); expect(merged.down).toBe(true);
  });
  it("drives physics proportionally and preserves A/D and arrow key priority", () => {
    const race = newRace(); race.phase = "racing";
    const half = newCar(), full = newCar();
    const gain = 1 - Math.exp(-C.STEER_RESPONSE / 60);
    step(half, race, { ...emptyInput(), steer: 0.5 }, 1 / 60);
    step(full, race, { ...emptyInput(), steer: 1 }, 1 / 60);
    expect(half.steer).toBeCloseTo(gain * 0.5);
    expect(full.steer).toBeCloseTo(half.steer * 2);
    for (const [code, sign] of [["KeyA", 1], ["ArrowLeft", 1], ["KeyD", -1], ["ArrowRight", -1]] as const) {
      const car = newCar();
      step(car, race, mergeInputs(resolveKeys(new Set([code])), { ...emptyInput(), steer: 0.5 }), 1 / 60);
      expect(car.steer).toBeCloseTo(sign * gain);
    }
  });
});