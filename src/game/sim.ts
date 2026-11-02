import { TRACK, N, HALF, CHECKPOINTS, nearest } from "./track";

export const C = {
  MAX: 68, ACCEL: 21, BRAKE: 44, REVERSE_MAX: 12, ROLL: 4, TURN: 1.9,
  HB_TURN: 1.6, HB_DECEL: 16, CAR_HALF_W: 1.1, COUNTDOWN: 3.5, LAPS: 3,
};

export type Input = { up: boolean; down: boolean; left: boolean; right: boolean; hb: boolean };
export type Phase = "menu" | "countdown" | "racing" | "paused" | "finished";
export type Car = { x: number; z: number; h: number; speed: number; idx: number; steer: number; wallT: number };
export type Race = {
  phase: Phase; countdown: number; time: number; lap: number; nextCp: number;
  lapTimes: number[]; lapStart: number;
};
export type Events = { wall?: boolean; cp?: boolean; lap?: boolean; finished?: boolean };

export function newCar(): Car {
  const p = TRACK.pts[N - 6]!;
  return { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), speed: 0, idx: N - 6, steer: 0, wallT: 0 };
}
export function newRace(): Race {
  return { phase: "menu", countdown: C.COUNTDOWN, time: 0, lap: 1, nextCp: 0, lapTimes: [], lapStart: 0 };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const toward0 = (v: number, amt: number) => (Math.abs(v) <= amt ? 0 : v - Math.sign(v) * amt);

export function step(car: Car, race: Race, input: Input, dt: number): Events {
  const ev: Events = {};
  if (race.phase === "countdown") {
    race.countdown -= dt;
    if (race.countdown <= 0.5) race.phase = "racing";
  }
  if (race.phase !== "racing") return ev;
  race.time += dt;

  // longitudinal
  if (input.up) car.speed += C.ACCEL * dt * (1 - Math.max(0, car.speed) / (C.MAX * 1.05));
  if (input.down) {
    if (car.speed > 0.5) car.speed -= C.BRAKE * dt;
    else car.speed = Math.max(car.speed - C.ACCEL * 0.5 * dt, -C.REVERSE_MAX);
  }
  if (!input.up && !input.down) car.speed = toward0(car.speed, C.ROLL * dt);
  if (input.hb) car.speed = toward0(car.speed, C.HB_DECEL * dt);
  car.speed = Math.min(car.speed, C.MAX);

  // steering
  const steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer += (steerIn - car.steer) * Math.min(1, 8 * dt);
  const sp = Math.abs(car.speed);
  const factor = Math.min(sp / 12, 1) * (1 - 0.4 * (sp / C.MAX));
  car.h += car.steer * C.TURN * factor * (input.hb ? C.HB_TURN : 1) * Math.sign(car.speed) * dt;

  car.x += Math.sin(car.h) * car.speed * dt;
  car.z += Math.cos(car.h) * car.speed * dt;

  // boundaries
  car.idx = nearest(car.x, car.z, car.idx);
  const p = TRACK.pts[car.idx]!;
  const off = (car.x - p.x) * p.nx + (car.z - p.z) * p.nz;
  const lim = HALF + 1.4 - C.CAR_HALF_W;
  car.wallT = Math.max(0, car.wallT - dt);
  if (Math.abs(off) > lim) {
    const push = off - Math.sign(off) * lim;
    car.x -= push * p.nx;
    car.z -= push * p.nz;
    if (car.wallT <= 0 && sp > 8) { car.speed *= 0.6; ev.wall = true; car.wallT = 0.5; }
    car.speed *= 1 - 1.2 * dt;
    const th = Math.atan2(p.tx, p.tz);
    const diff = wrapAngle(th - car.h);
    if (Math.abs(diff) < Math.PI / 2) car.h += diff * Math.min(1, 5 * dt);
  }

  // checkpoints & laps
  if (race.nextCp < CHECKPOINTS.length) {
    const cp = CHECKPOINTS[race.nextCp]!;
    if (car.idx >= cp && car.idx < cp + 40) { race.nextCp++; ev.cp = true; }
  } else if (car.idx < 40) {
    race.lapTimes.push(race.time - race.lapStart);
    race.lapStart = race.time;
    race.nextCp = 0;
    race.lap++;
    ev.lap = true;
    if (race.lap > C.LAPS) { race.lap = C.LAPS; race.phase = "finished"; ev.finished = true; }
  }
  return ev;
}

export function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
