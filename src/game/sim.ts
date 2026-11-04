import { TRACK, N, HALF, CHECKPOINTS, nearest } from "./track";

export const C = {
  MAX: 68, ACCEL: 27, BRAKE: 44, REVERSE_MAX: 12, ROLL: 4, TURN: 1.9,
  GRIP: 9, DRIFT_GRIP: 1.4, STEER_RESPONSE: 7, YAW_RESPONSE: 5,
  BOOST_MAX: 90, BOOST_ACCEL: 36, BOOST_DRAIN: 25, BOOST_RECHARGE: 12,
  HB_TURN: 1.6, HB_DECEL: 16, CAR_HALF_W: 1.1, COUNTDOWN: 3.5, LAPS: 3,
};

export type Input = { up: boolean; down: boolean; left: boolean; right: boolean; hb: boolean; boost?: boolean; steer?: number };
export type Phase = "menu" | "countdown" | "racing" | "paused" | "finished";
export type Car = { x: number; z: number; h: number; speed: number; idx: number; steer: number; wallT: number; vx: number; vz: number; yawRate: number; slip: number; drifting: boolean; nitro: number; boosting: boolean };
export type Race = {
  phase: Phase; countdown: number; time: number; lap: number; nextCp: number;
  lapTimes: number[]; lapStart: number;
};
export type Events = { wall?: boolean; cp?: boolean; lap?: boolean; finished?: boolean };

export function newCar(): Car {
  const p = TRACK.pts[N - 6];
  if (!p) throw new Error("Track start missing");
  return { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), speed: 0, idx: N - 6, steer: 0, wallT: 0, vx: 0, vz: 0, yawRate: 0, slip: 0, drifting: false, nitro: 100, boosting: false };
}
export function newRace(): Race {
  return { phase: "menu", countdown: C.COUNTDOWN, time: 0, lap: 1, nextCp: 0, lapTimes: [], lapStart: 0 };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const toward0 = (v: number, amt: number) => (Math.abs(v) <= amt ? 0 : v - Math.sign(v) * amt);

export function step(car: Car, race: Race, input: Input, dt: number): Events {
  dt = Math.min(Math.max(dt, 0), 0.05);
  const ev: Events = {};
  car.boosting = false;
  if (race.phase === "countdown") {
    race.countdown -= dt;
    if (race.countdown <= 0.5) race.phase = "racing";
  }
  if (race.phase !== "racing") return ev;
  race.time += dt;

  // +Z is forward at yaw zero. Preserve world momentum as the body turns.
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  const rx = Math.cos(car.h), rz = -Math.sin(car.h);
  let forward = car.vx * fx + car.vz * fz;
  let lateral = car.vx * rx + car.vz * rz;
  const steerIn = input.left || input.right
    ? (input.left ? 1 : 0) - (input.right ? 1 : 0)
    : Math.max(-1, Math.min(1, Number.isFinite(input.steer) ? (input.steer ?? 0) : 0));
  car.steer += (steerIn - car.steer) * (1 - Math.exp(-C.STEER_RESPONSE * dt));
  car.drifting = (input.hb || input.down) && Math.abs(car.steer) > 0.18 && Math.abs(forward) > 12;
  car.boosting = !!input.boost && car.nitro > 0 && !input.down && !input.hb;
  car.nitro = Math.max(0, Math.min(100, car.nitro + (car.boosting ? -C.BOOST_DRAIN : C.BOOST_RECHARGE) * dt));
  if (input.up) forward += C.ACCEL * Math.max(0, 1 - (Math.max(0, forward) / C.MAX) ** 2) * dt;
  if (input.down) {
    if (forward > 0.5) forward = Math.max(0, forward - C.BRAKE * (car.drifting ? 0.38 : 1) * dt);
    else if (!input.up) forward = Math.max(forward - C.ACCEL * 0.5 * dt, -C.REVERSE_MAX);
  }
  if (input.hb) forward = toward0(forward, C.HB_DECEL * dt);
  if (!input.up && !input.down) forward = toward0(forward, C.ROLL * dt);
  if (car.boosting) forward += C.BOOST_ACCEL * dt;
  const maxSpeed = car.boosting ? C.BOOST_MAX : C.MAX;
  if (!car.boosting && forward > C.MAX) forward = toward0(forward, 12 * dt);
  else forward = Math.min(forward, maxSpeed);
  const sp = Math.abs(forward);
  const factor = Math.min(sp / 12, 1) * (1 - 0.4 * Math.min(sp / C.MAX, 1));
  const yawTarget = car.steer * C.TURN * factor * (car.drifting ? C.HB_TURN : 1) * Math.sign(forward);
  car.yawRate += (yawTarget - car.yawRate) * (1 - Math.exp(-C.YAW_RESPONSE * dt));
  car.h += car.yawRate * dt;
  lateral *= Math.exp(-(car.drifting ? C.DRIFT_GRIP : C.GRIP) * dt);
  car.vx = fx * forward + rx * lateral;
  car.vz = fz * forward + rz * lateral;
  car.speed = forward;
  car.slip = sp > 3 ? wrapAngle(Math.atan2(car.vx, car.vz) - car.h) : 0;
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // boundaries
  car.idx = nearest(car.x, car.z, car.idx);
  const p = TRACK.pts[car.idx];
  if (!p) return ev;
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

  if (Math.abs(off) > lim) {
    car.vx = Math.sin(car.h) * car.speed;
    car.vz = Math.cos(car.h) * car.speed;
    car.yawRate *= Math.exp(-5 * dt);
  }

  // checkpoints & laps
  if (race.nextCp < CHECKPOINTS.length) {
    const cp = CHECKPOINTS[race.nextCp];
    if (cp === undefined) return ev;
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
