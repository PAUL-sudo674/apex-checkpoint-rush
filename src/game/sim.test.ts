import { describe, it, expect } from "vitest";
import { newCar, newRace, step, C, type Input } from "./sim";
import { TRACK, N } from "./track";
import { KEY_MAP, resolveKeys } from "./input";

function drive(seconds: number, auto = true) {
  const car = newCar();
  const race = newRace();
  race.phase = "countdown";
  const input: Input = { up: true, down: false, left: false, right: false, hb: false };
  let walls = 0;
  for (let t = 0; t < seconds && (race.phase as string) !== "finished"; t += 1 / 60) {
    if (auto) {
      const target = TRACK.pts[(car.idx + 12) % N]!;
      const want = Math.atan2(target.x - car.x, target.z - car.z);
      const diff = Math.atan2(Math.sin(want - car.h), Math.cos(want - car.h));
      input.left = diff > 0.03;
      input.right = diff < -0.03;
      input.up = Math.abs(diff) < 0.25 || car.speed < 25;
    }
    if (step(car, race, input, 1 / 60).wall) walls++;
  }
  return { car, race, walls };
}

describe("race rules", () => {
  it("Shift and Space activate nitro while X is the separate drift key", () => {
    expect(KEY_MAP.ShiftLeft).toBe("boost");
    expect(KEY_MAP.ShiftRight).toBe("boost");
    expect(KEY_MAP.Space).toBe("boost");
    expect(KEY_MAP.KeyX).toBe("hb");
    expect(resolveKeys(new Set(["Space", "ShiftLeft"])).boost).toBe(true);
    expect(resolveKeys(new Set(["ShiftLeft"])).boost).toBe(true);
  });

  it("nitro drains during boost, recharges over time, and stays within its bar", () => {
    const car = newCar(), race = newRace(); race.phase = "racing";
    const input: Input = { up: true, down: false, left: false, right: false, hb: false, boost: true };
    for (let i = 0; i < 60; i++) step(car, race, input, 1 / 60);
    expect(car.nitro).toBeCloseTo(75, 5);
    expect(car.boosting).toBe(true);
    input.boost = false;
    for (let i = 0; i < 60; i++) step(car, race, input, 1 / 60);
    expect(car.nitro).toBeCloseTo(87, 5);
    for (let i = 0; i < 600; i++) step(car, race, input, 1 / 60);
    expect(car.nitro).toBe(100);
  });

  it("brake plus steering drifts at speed, but not when parked", () => {
    const car = newCar(), race = newRace(); race.phase = "racing";
    const input: Input = { up: false, down: true, left: true, right: false, hb: false };
    step(car, race, input, 1 / 60);
    expect(car.drifting).toBe(false);
    car.vx = Math.sin(car.h) * 30; car.vz = Math.cos(car.h) * 30;
    for (let i = 0; i < 20; i++) step(car, race, input, 1 / 60);
    expect(car.drifting).toBe(true);
    expect(Math.abs(car.slip)).toBeGreaterThan(0.08);
  });

  it("steering has inertia and brakes reduce forward speed", () => {
    const car = newCar(), race = newRace(); race.phase = "racing";
    car.vx = Math.sin(car.h) * 25; car.vz = Math.cos(car.h) * 25;
    const input: Input = { up: false, down: true, left: false, right: false, hb: false };
    step(car, race, input, 1 / 60);
    expect(car.speed).toBeLessThan(25);
    input.down = false; input.left = true;
    step(car, race, input, 1 / 60);
    expect(car.steer).toBeGreaterThan(0);
    expect(car.steer).toBeLessThan(1);
    const yaw = car.yawRate; input.left = false;
    step(car, race, input, 1 / 60);
    expect(car.yawRate).toBeGreaterThan(0);
    expect(yaw).toBeGreaterThan(0);
  });

  it("boost freezes while paused", () => {
    const car = newCar(), race = newRace(); race.phase = "paused";
    car.nitro = 50;
    step(car, race, { up: true, down: false, left: false, right: false, hb: false, boost: true }, 0.05);
    expect(car.nitro).toBe(50);
    expect(car.speed).toBe(0);
  });
  it("countdown holds the car still, then racing starts", () => {
    const car = newCar();
    const race = newRace();
    race.phase = "countdown";
    const x0 = car.x;
    const input: Input = { up: true, down: false, left: false, right: false, hb: false };
    for (let i = 0; i < 60; i++) step(car, race, input, 1 / 60);
    expect(car.x).toBe(x0);
    expect(race.phase).toBe("countdown");
    for (let i = 0; i < 200; i++) step(car, race, input, 1 / 60);
    expect(race.phase).toBe("racing");
  });

  it("a driver following the road finishes all 3 laps", () => {
    const { race } = drive(600);
    expect(race.phase).toBe("finished");
    expect(race.lapTimes.length).toBe(C.LAPS);
  });

  it("driving straight into the wall keeps the car on the track", () => {
    const car = newCar();
    const race = newRace();
    race.phase = "racing";
    const input: Input = { up: true, down: false, left: true, right: false, hb: false };
    for (let i = 0; i < 600; i++) step(car, race, input, 1 / 60);
    const p = TRACK.pts[car.idx]!;
    const off = Math.abs((car.x - p.x) * p.nx + (car.z - p.z) * p.nz);
    expect(off).toBeLessThan(8.5);
  });
});
