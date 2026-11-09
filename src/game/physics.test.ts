import { describe, expect, it } from "vitest";
import { C, createPhysicsClock, newCar, newRace, speedKmh, automaticGear, step } from "./sim";
import { emptyInput } from "./input";

describe("SI vehicle physics", () => {
  it("converts actual velocity magnitude from m/s to km/h including side slip", () => {
    expect(speedKmh({ vx: 3, vz: 4 })).toBe(18);
    expect(speedKmh({ vx: 0, vz: -10 })).toBe(36);
  });
  it("produces identical physics at 30, 60 and 120 rendering frames per second", () => {
    function run(fps: number) {
      const car = newCar(), race = newRace(), clock = createPhysicsClock();
      race.phase = "racing";
      for (let i = 0; i < fps * 2; i++) clock.advance(car, race, { ...emptyInput(), up: true, steer: 0.2 }, 1 / fps, () => {});
      return { car, race };
    }
    expect(run(30)).toEqual(run(60));
    expect(run(120)).toEqual(run(60));
  });
  it("limits stall catch-up and freezes paused simulation time", () => {
    const car = newCar(), race = newRace(), clock = createPhysicsClock();
    race.phase = "racing";
    clock.advance(car, race, emptyInput(), 10, () => {});
    expect(race.time).toBeCloseTo(0.25, 10);
    race.phase = "paused";
    clock.advance(car, race, emptyInput(), 10, () => {});
    expect(race.time).toBeCloseTo(0.25, 10);
  });
  it("uses finite road-car acceleration, drag and consistent ground speed", () => {
    const car = newCar(), race = newRace(); race.phase = "racing";
    step(car, race, { ...emptyInput(), up: true }, C.FIXED_DT);
    expect(car.speed).toBeGreaterThan(0);
    expect(car.speed).toBeLessThanOrEqual(6 / 60);
    car.vx = Math.sin(car.h) * 30; car.vz = Math.cos(car.h) * 30;
    step(car, race, emptyInput(), C.FIXED_DT);
    expect(car.speed).toBeLessThan(30);
    expect(car.speed).toBe(Math.hypot(car.vx, car.vz));
  });
  it("steering cannot create velocity at rest and limits yaw by tire grip", () => {
    const car = newCar(), race = newRace(); race.phase = "racing";
    for (let i = 0; i < 60; i++) step(car, race, { ...emptyInput(), left: true }, C.FIXED_DT);
    expect(car.speed).toBe(0); expect(car.yawRate).toBe(0);
    car.vx = Math.sin(car.h) * 40; car.vz = Math.cos(car.h) * 40;
    step(car, race, { ...emptyInput(), left: true }, C.FIXED_DT);
    expect(Math.abs(car.yawRate)).toBeLessThan(C.TIRE_MU * C.GRAVITY / 39);
    expect(car.steeringAngle).toBeLessThan(C.STEER_ANGLE);
  });
  it("brakes to zero without overshoot on the stopping tick", () => {
    const car = newCar(), race = newRace(); race.phase = "racing";
    car.vx = Math.sin(car.h) * 0.05; car.vz = Math.cos(car.h) * 0.05;
    step(car, race, { ...emptyInput(), down: true }, C.FIXED_DT);
    expect(car.speed).toBeCloseTo(0, 12);
  });
  it("handbrake dissipates momentum without injecting acceleration", () => {
    const car = newCar(), race = newRace(); race.phase = "racing";
    car.vx = Math.sin(car.h) * 15; car.vz = Math.cos(car.h) * 15;
    step(car, race, { ...emptyInput(), hb: true }, C.FIXED_DT);
    expect(car.speed).toBeLessThan(15);
    expect(car.boosting).toBe(false);
  });
  it("wall contact preserves tangential velocity and rejects outward velocity", () => {
    const car = newCar(), race = newRace(); race.phase = "racing";
    // Start just beyond the same local boundary with both forward/outward momentum.
    const h = car.h, nx = Math.cos(h), nz = -Math.sin(h);
    car.x += nx * 8; car.z += nz * 8;
    car.vx = Math.sin(h) * 20 + nx * 5; car.vz = Math.cos(h) * 20 + nz * 5;
    const before = Math.hypot(car.vx, car.vz);
    const ev = step(car, race, emptyInput(), C.FIXED_DT);
    expect(ev.wall).toBe(true);
    expect(car.speed).toBeLessThan(before);
    expect(car.speed).toBeGreaterThan(15);
    expect(car.speed).toBe(Math.hypot(car.vx, car.vz));
  });
  it("automatic gears derive from signed forward speed", () => {
    expect(automaticGear(-10)).toBe(-1);
    expect(automaticGear(0)).toBe(0);
    expect(automaticGear(10)).toBe(1);
    expect(automaticGear(30)).toBe(3);
    expect(automaticGear(65)).toBe(6);
  });
});