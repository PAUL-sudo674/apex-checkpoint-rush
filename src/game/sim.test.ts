import { describe, it, expect } from "vitest";
import { newCar, newRace, step, C, type Input } from "./sim";
import { TRACK, N } from "./track";

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
