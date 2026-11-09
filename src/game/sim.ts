import { TRACK, N, HALF, CHECKPOINTS, nearest } from "./track";

// SI throughout: meters, seconds, kilograms, radians; MAX values are HUD/audio
// reference speeds, not velocity clamps. Tune this road-car preset here.
export const C = {
  FIXED_DT: 1 / 60, MAX_FRAME: 0.25,
  MASS: 1400, YAW_INERTIA: 2400, WHEELBASE: 2.65,
  ENGINE_POWER: 170000, DRIVE_FORCE: 8400, ACCEL: 6,
  AIR_DENSITY: 1.225, CD_AREA: 0.65, ROLL: 0.012, GRAVITY: 9.81,
  BRAKE: 9, REVERSE_MAX: 12, REVERSE_ACCEL: 2.5,
  MAX: 68, BOOST_MAX: 90, BOOST_POWER: 300000,
  BOOST_ACCEL: 36, BOOST_DRAIN: 25, BOOST_RECHARGE: 12,
  STEER_ANGLE: Math.PI / 6, STEER_RATE: 3.6, STEER_RESPONSE: 7,
  STEER_SPEED: 22, YAW_RESPONSE: 5, GRIP: 9, DRIFT_GRIP: 1.4,
  TIRE_MU: 1.05, DRIFT_MU: 0.6, DRIFT_SIDE_FACTOR: 0.15, HB_DECEL: 4,
  WALL_RESTITUTION: 0.08, WALL_FRICTION: 0.25,
  CAR_HALF_W: 1.1, COUNTDOWN: 3.5, LAPS: 3,
};

export type Input = { up: boolean; down: boolean; left: boolean; right: boolean; hb: boolean; boost?: boolean; steer?: number };
export type Phase = "menu" | "countdown" | "racing" | "paused" | "finished";
export type Car = { x: number; z: number; h: number; speed: number; idx: number; steer: number; wallT: number; vx: number; vz: number; yawRate: number; slip: number; drifting: boolean; nitro: number; boosting: boolean; steeringAngle: number; gear: number; distance: number };
export type Race = {
  phase: Phase; countdown: number; time: number; lap: number; nextCp: number;
  lapTimes: number[]; lapStart: number;
};
export type Events = { wall?: boolean; cp?: boolean; lap?: boolean; finished?: boolean };

export function newCar(): Car {
  const p = TRACK.pts[N - 6];
  if (!p) throw new Error("Track start missing");
  return { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), speed: 0, idx: N - 6, steer: 0, wallT: 0, vx: 0, vz: 0, yawRate: 0, slip: 0, drifting: false, nitro: 100, boosting: false, steeringAngle: 0, gear: 0, distance: 0 };
}
export function newRace(): Race {
  return { phase: "menu", countdown: C.COUNTDOWN, time: 0, lap: 1, nextCp: 0, lapTimes: [], lapStart: 0 };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Ground speed, including sideways motion; never a nominal engine speed. */
export const speedKmh = (car: Pick<Car, "vx" | "vz">) => Math.hypot(car.vx, car.vz) * 3.6;
export function automaticGear(forward: number) {
  if (forward < -0.3) return -1;
  if (Math.abs(forward) < 0.3) return 0;
  return 1 + [12, 22, 34, 47, 60].filter((threshold) => forward >= threshold).length;
}
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

  // +Z forward, +X right: positive heading/steering turns right.
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  const rx = Math.cos(car.h), rz = -Math.sin(car.h);
  let forward = car.vx * fx + car.vz * fz;
  const lateral = car.vx * rx + car.vz * rz;
  const steerIn = input.left || input.right
    ? (input.right ? 1 : 0) - (input.left ? 1 : 0)
    : Math.max(-1, Math.min(1, Number.isFinite(input.steer) ? (input.steer ?? 0) : 0));
  const steerChange = (steerIn - car.steer) * (1 - Math.exp(-C.STEER_RESPONSE * dt));
  const maxSteerChange = C.STEER_RATE / C.STEER_ANGLE * dt;
  car.steer = Math.max(-1, Math.min(1, car.steer + Math.max(-maxSteerChange, Math.min(maxSteerChange, steerChange))));
  car.steeringAngle = car.steer * C.STEER_ANGLE / (1 + (Math.abs(forward) / C.STEER_SPEED) ** 2);
  car.drifting = (input.hb || input.down) && Math.abs(car.steer) > 0.18 && Math.abs(forward) > 12;
  car.boosting = !!input.boost && car.nitro > 0 && !input.down && !input.hb;
  car.nitro = Math.max(0, Math.min(100, car.nitro + (car.boosting ? -C.BOOST_DRAIN : C.BOOST_RECHARGE) * dt));

  // F = P / v at speed; torque/traction limited near rest. Drag ~ v².
  const gripAccel = (car.drifting ? C.DRIFT_MU : C.TIRE_MU) * C.GRAVITY;
  const power = car.boosting ? C.ENGINE_POWER + C.BOOST_POWER : C.ENGINE_POWER;
  const driveForce = Math.min(C.DRIVE_FORCE * (car.boosting ? 1.55 : 1), power / Math.max(Math.abs(forward), 8));
  const throttleAccel = input.up || car.boosting ? driveForce / C.MASS : 0;
  const aeroAccel = 0.5 * C.AIR_DENSITY * C.CD_AREA * forward * forward / C.MASS;
  forward += Math.min(gripAccel, throttleAccel) * dt;
  forward = toward0(forward, (aeroAccel + C.ROLL * C.GRAVITY) * dt);
  if (input.down) {
    if (forward > 0) forward = Math.max(0, forward - C.BRAKE * (car.drifting ? 0.38 : 1) * dt);
    else if (!input.up && !input.hb) forward -= C.REVERSE_ACCEL * Math.max(0, 1 - Math.abs(forward) / C.REVERSE_MAX) * dt;
  }
  if (input.hb) forward = toward0(forward, C.HB_DECEL * dt);

  // Bicycle yaw target, tire friction limit, finite angular torque/inertia.
  const sp = Math.abs(forward);
  const bicycleYaw = forward / C.WHEELBASE * Math.tan(car.steeringAngle);
  const yawLimit = gripAccel / Math.max(sp, 1);
  const yawTarget = Math.max(-yawLimit, Math.min(yawLimit, bicycleYaw));
  const yawTorque = (yawTarget - car.yawRate) * C.YAW_RESPONSE * C.YAW_INERTIA;
  const maxTorque = C.MASS * gripAccel * C.WHEELBASE * 0.5;
  car.yawRate += Math.max(-maxTorque, Math.min(maxTorque, yawTorque)) / C.YAW_INERTIA * dt;
  // Carry forward speed into the NEW heading. Previously the old-axis lateral
  // force fought the turn and exhausted grip under throttle. Keep residual slip
  // with exponential damping; drift retains more of the old world momentum.
  const grip = car.drifting ? C.DRIFT_GRIP : C.GRIP;
  const driftSlip = car.drifting ? -forward * car.yawRate * dt * (1 - C.DRIFT_SIDE_FACTOR) : 0;
  const nextLateral = (lateral + driftSlip) * Math.exp(-grip * dt);
  car.h = wrapAngle(car.h + car.yawRate * dt);
  const nextFx = Math.sin(car.h), nextFz = Math.cos(car.h);
  car.vx = nextFx * forward + nextFz * nextLateral;
  car.vz = nextFz * forward - nextFx * nextLateral;
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Hard boundary position correction + contact impulse only on outward motion.
  // Tangential momentum survives; no heading snapping or repeated impact damping.
  car.idx = nearest(car.x, car.z, car.idx);
  const p = TRACK.pts[car.idx];
  if (!p) return ev;
  const off = (car.x - p.x) * p.nx + (car.z - p.z) * p.nz;
  const lim = HALF + 1.4 - C.CAR_HALF_W;
  car.wallT = Math.max(0, car.wallT - dt);
  if (Math.abs(off) > lim) {
    const sign = Math.sign(off), push = off - sign * lim;
    car.x -= push * p.nx; car.z -= push * p.nz;
    const nx = p.nx * sign, nz = p.nz * sign;
    const outward = car.vx * nx + car.vz * nz;
    if (outward > 0) {
      const impulse = (1 + C.WALL_RESTITUTION) * outward;
      const tangent = car.vx * p.tx + car.vz * p.tz;
      const friction = Math.sign(tangent) * Math.min(Math.abs(tangent), C.WALL_FRICTION * impulse);
      car.vx -= impulse * nx + friction * p.tx;
      car.vz -= impulse * nz + friction * p.tz;
      car.yawRate *= Math.exp(-5 * dt);
      if (car.wallT <= 0 && outward > 2) { ev.wall = true; car.wallT = 0.5; }
    }
  }
  car.speed = Math.hypot(car.vx, car.vz); // actual ground speed in m/s
  const bodyForward = car.vx * Math.sin(car.h) + car.vz * Math.cos(car.h);
  car.gear = automaticGear(bodyForward);
  car.slip = car.speed > 3 ? wrapAngle(Math.atan2(car.vx, car.vz) - car.h) : 0;
  car.distance += car.speed * dt;

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

/** Bounded fixed-step clock. Long stalls discard excess wall time, preventing
 * background catch-up/spiral-of-death; race time counts simulated time only. */
export function createPhysicsClock() {
  let accumulator = 0;
  let currentCar: Car | undefined;
  let previous = { x: 0, z: 0, h: 0 };
  return {
    advance(car: Car, race: Race, input: Input, elapsed: number, onEvent: (event: Events) => void) {
      if (currentCar !== car || (race.phase !== "racing" && race.phase !== "countdown")) {
        accumulator = 0; currentCar = car;
        previous = { x: car.x, z: car.z, h: car.h };
      }
      if (race.phase !== "racing" && race.phase !== "countdown") return;
      accumulator += Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, C.MAX_FRAME)) : 0;
      while (accumulator + 1e-10 >= C.FIXED_DT) {
        previous = { x: car.x, z: car.z, h: car.h };
        const event = step(car, race, input, C.FIXED_DT);
        accumulator = Math.max(0, accumulator - C.FIXED_DT);
        if (event.wall || event.cp || event.lap || event.finished) onEvent(event);
        if (race.phase !== "racing" && race.phase !== "countdown") { accumulator = 0; break; }
      }
    },
    pose(car: Car) {
      const alpha = accumulator / C.FIXED_DT;
      return { x: previous.x + (car.x - previous.x) * alpha,
        z: previous.z + (car.z - previous.z) * alpha,
        h: previous.h + wrapAngle(car.h - previous.h) * alpha };
    },
  };
}
