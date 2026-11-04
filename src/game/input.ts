import type { Input } from "./sim";

export type DigitalAction = Exclude<keyof Input, "steer">;
export const KEY_MAP: Record<string, DigitalAction> = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  KeyX: "hb", ShiftLeft: "boost", ShiftRight: "boost", Space: "boost",
};

export function emptyInput(): Input {
  return { up: false, down: false, left: false, right: false, hb: false, boost: false };
}

export function resolveKeys(keys: Set<string>): Input {
  const input = emptyInput();
  for (const code of keys) {
    const action = KEY_MAP[code];
    if (action) input[action] = true;
  }
  return input;
}

export function mergeInputs(keys: Input, touch: Input): Input {
  return {
    up: keys.up || touch.up, down: keys.down || touch.down,
    left: keys.left || touch.left, right: keys.right || touch.right,
    hb: keys.hb || touch.hb, boost: !!keys.boost || !!touch.boost,
    steer: touch.steer ?? 0,
  };
}