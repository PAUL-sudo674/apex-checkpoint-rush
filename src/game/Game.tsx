import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene } from "./Scene";
import { newCar, newRace, fmtTime, step, speedKmh, C, type Input, type Events, type Phase } from "./sim";
import { KEY_MAP, emptyInput, resolveKeys, mergeInputs, type DigitalAction } from "./input";
import { SteeringWheel } from "./SteeringWheel";
import { Button } from "@/components/ui/button";
import { Zap, Gauge } from "lucide-react";
import { TRACK, N, CHECKPOINTS } from "./track";
import { Sfx } from "./audio";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";

type Hud = { speed: number; gear: number; lap: number; time: number; cd: number; x: number; z: number; lastLap?: number | undefined; nitro: number; boosting: boolean; drifting: boolean; nextCp: number; idx: number };
const BEST_KEY = "apex-best-time";

// minimap path
const xs = TRACK.pts.map((p) => p.x), zs = TRACK.pts.map((p) => p.z);
const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
const MS = 130 / Math.max(maxX - minX, maxZ - minZ);
const mapPt = (x: number, z: number) => [(maxX - x) * MS + 5, (maxZ - z) * MS + 5] as const;
const MAP_PATH = TRACK.pts.filter((_, i) => i % 4 === 0).map((p) => mapPt(p.x, p.z).join(",")).join(" ");
const MAP_W = (maxX - minX) * MS + 10, MAP_H = (maxZ - minZ) * MS + 10;

export default function Game() {
  const car = useRef(newCar());
  const race = useRef(newRace());
  const input = useRef<Input>(emptyInput());
  const keyboard = useRef(new Set<string>());
  const touch = useRef<Input>(emptyInput());
  const sfx = useRef(new Sfx());
  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<Hud>({ speed: 0, gear: 0, lap: 1, time: 0, cd: C.COUNTDOWN, x: car.current.x, z: car.current.z, nitro: 100, boosting: false, drifting: false, nextCp: 0, idx: car.current.idx });
  const [muted, setMuted] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [ready, setReady] = useState(false);
  const lastBeep = useRef(4);

  useEffect(() => {
    const b = localStorage.getItem(BEST_KEY);
    if (b) setBest(parseFloat(b));
  }, []);

  const showFlash = (t: string) => {
    setFlash(t);
    window.setTimeout(() => setFlash((f) => (f === t ? null : f)), 1300);
  };

  const start = useCallback(() => {
    car.current = newCar();
    race.current = newRace();
    race.current.phase = "countdown";
    input.current = emptyInput(); touch.current = emptyInput(); keyboard.current.clear();
    lastBeep.current = 4;
    setFlash(null);
    setNewBest(false);
    setPhase("countdown");
  }, []);

  const togglePause = useCallback(() => {
    const r = race.current;
    if (r.phase === "racing" || r.phase === "countdown") { (r as { prev?: Phase }).prev = r.phase; r.phase = "paused"; setPhase("paused"); }
    else if (r.phase === "paused") { const p = (r as { prev?: Phase }).prev ?? "racing"; r.phase = p; setPhase(p); }
  }, []);

  const toMenu = () => { race.current = newRace(); car.current = newCar(); setPhase("menu"); };

  const onEvents = useCallback((e: Events) => {
    const r = race.current;
    if (e.wall) sfx.current.thud();
    if (e.cp) { showFlash("CHECKPOINT"); sfx.current.checkpoint(); }
    if (e.lap && !e.finished) { showFlash(r.lap === C.LAPS ? "FINAL LAP" : `LAP ${r.lap}`); sfx.current.beep(1200, 0.2); }
    if (e.finished) {
      setPhase("finished");
      sfx.current.checkpoint();
      const prev = parseFloat(localStorage.getItem(BEST_KEY) ?? "Infinity");
      if (r.time < prev) { localStorage.setItem(BEST_KEY, String(r.time)); setBest(r.time); setNewBest(true); }
    }
  }, []);

  const onHud = useCallback(() => {
    const r = race.current, c = car.current;
    if (r.phase === "countdown") {
      const n = Math.ceil(r.countdown - 0.5);
      if (n < lastBeep.current) { lastBeep.current = n; sfx.current.beep(n > 0 ? 520 : 1040, n > 0 ? 0.15 : 0.35); }
    }
    if (r.phase === "racing" && race.current.phase !== phaseRef.current) setPhase("racing");
    sfx.current.engine(Math.abs(c.speed) / C.MAX, input.current.up, r.phase === "racing", c.drifting, c.boosting);
    setHud({ speed: speedKmh(c), gear: c.gear, lap: r.lap, time: r.time, cd: r.countdown, x: c.x, z: c.z, lastLap: r.lapTimes[r.lapTimes.length - 1], nitro: c.nitro, boosting: c.boosting, drifting: c.drifting, nextCp: r.nextCp, idx: c.idx });
  }, []);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const mergeInput = useCallback(() => {
    Object.assign(input.current, mergeInputs(resolveKeys(keyboard.current), touch.current));
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (KEY_MAP[e.code]) { keyboard.current.add(e.code); mergeInput(); e.preventDefault(); }
      if (e.repeat) return;
      if (e.code === "Escape" || e.code === "KeyP") togglePause();
      if (e.code === "Enter" && (race.current.phase === "menu" || race.current.phase === "finished")) start();
      if (e.code === "KeyR" && race.current.phase !== "menu") start();
    };
    const up = (e: KeyboardEvent) => { keyboard.current.delete(e.code); mergeInput(); };
    const blur = () => { keyboard.current.clear(); touch.current = emptyInput(); mergeInput(); };
    const hidden = () => { if (document.hidden) { blur(); sfx.current.engine(0, false, false); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", hidden); };
  }, [start, togglePause, mergeInput]);

  useEffect(() => {
    if (phase === "paused" || phase === "menu" || phase === "finished") {
      touch.current = emptyInput(); keyboard.current.clear(); mergeInput();
      sfx.current.engine(0, false, false);
    }
  }, [phase, mergeInput]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const api = {
      get state() { return { car: { ...car.current }, race: { ...race.current }, input: { ...input.current } }; },
      get audio() { return sfx.current.meters(); },
      start, pause: togglePause,
      setInput(values: Partial<Input>) { Object.assign(input.current, values); },
      sim(seconds: number) {
        for (let t = 0; t < Math.min(seconds, 600); t += 1 / 60) {
          const ev = step(car.current, race.current, input.current, 1 / 60);
          if (ev.wall || ev.cp || ev.lap || ev.finished) onEvents(ev);
        }
        setPhase(race.current.phase); onHud();
      },
    };
    const w = window as unknown as { __game?: typeof api };
    w.__game = api;
    if (new URLSearchParams(location.search).has("race")) start();
    return () => { delete w.__game; };
  }, [start, togglePause, onEvents, onHud]);

  const toggleSound = () => { const m = !muted; setMuted(m); sfx.current.setEnabled(!m); };

  useWebMCP({
    name: "get_race_status",
    description: "Read the current race state: phase, lap, elapsed time, speed and best time.",
    annotations: { readOnlyHint: true },
    execute: () => runWebMCPTool("get_race_status", () =>
      `Phase: ${phase}. Lap ${hud.lap}/${C.LAPS}. Time ${fmtTime(hud.time)}. Speed ${Math.round(hud.speed)} km/h. Best: ${best != null ? fmtTime(best) : "none"}.`),
  });
  useWebMCP({
    name: "start_race",
    description: "Start (or restart) a race from the countdown.",
    execute: () => runWebMCPTool("start_race", () => { start(); return "Race starting."; }),
  });
  useWebMCP({
    name: "set_paused",
    description: "Pause or resume the current race.",
    inputSchema: { type: "object", properties: { paused: { type: "boolean", description: "true to pause, false to resume." } }, required: ["paused"] },
    execute: ({ paused }: { paused: boolean }) => runWebMCPTool("set_paused", () => {
      if (typeof paused !== "boolean") throw new Error("paused must be true or false.");
      const p = race.current.phase;
      if (paused && (p === "racing" || p === "countdown")) togglePause();
      else if (!paused && p === "paused") togglePause();
      else if (paused ? p !== "paused" : true) throw new Error("No race in progress to change.");
      return paused ? "Race paused." : "Race resumed.";
    }),
  });

  const [mx, my] = mapPt(hud.x, hud.z);
  const cdNum = Math.ceil(hud.cd - 0.5);
  const inRace = phase === "racing" || phase === "countdown" || phase === "paused";
  const speedPct = Math.min(hud.speed / (C.MAX * 3.6), 1);

  return (
    <div className="fixed inset-0 overflow-hidden bg-background select-none" data-scene-ready={ready ? "" : undefined}>
      <Canvas dpr={[1, 1.75]} camera={{ fov: 62, near: 0.1, far: 1500 }} gl={{ antialias: true }}>
        <Scene car={car} race={race} input={input} onEvents={onEvents} onHud={onHud} onReady={() => setReady(true)} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 hud-vignette" />
      {phase === "racing" && hud.speed > 150 && <div className={hud.boosting ? "speed-lines is-boosting" : "speed-lines"} aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--line-angle": `${i * 20}deg`, "--line-delay": `${(i % 5) * -0.18}s` } as React.CSSProperties} />)}
      </div>}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-5">
        {inRace || phase === "finished" ? (
          <div className="flex gap-2">
            <div className="hud-panel px-3 py-2 sm:px-4">
              <div className="hud-label">Lap</div>
              <div className="font-display text-2xl font-bold tabular-nums sm:text-3xl">{hud.lap}<span className="text-muted-foreground">/{C.LAPS}</span></div>
            </div>
            <div className="hud-panel px-3 py-2 sm:px-4">
              <div className="hud-label">Time</div>
              <div className="font-display text-2xl font-bold tabular-nums sm:text-3xl">{fmtTime(hud.time)}</div>
              {hud.lastLap !== undefined && <div className="text-xs text-muted-foreground tabular-nums">Last {fmtTime(hud.lastLap)}</div>}
            </div>
          </div>
        ) : <div />}
        <div className="pointer-events-auto flex gap-2">
          <Button variant="ghost" className="btn-icon" onClick={toggleSound} aria-label={muted ? "Unmute sound" : "Mute sound"}>
            {muted ? <SpeakerOff /> : <SpeakerOn />}
          </Button>
          {inRace && (
            <>
              <Button variant="ghost" className="btn-icon" onClick={togglePause} aria-label={phase === "paused" ? "Resume" : "Pause"}>{phase === "paused" ? "▶" : "❚❚"}</Button>
              <Button variant="ghost" className="btn-icon" onClick={start} aria-label="Restart race">↻</Button>
            </>
          )}
        </div>
      </div>

      {/* Minimap */}
      {inRace && (
        <div className="hud-panel race-minimap">
          <svg width={MAP_W} height={MAP_H}>
            <polygon points={MAP_PATH} className="fill-none stroke-muted-foreground" strokeWidth={4} strokeLinejoin="round" />
            {CHECKPOINTS.map((idx, i) => {
              const p = TRACK.pts[idx]; if (!p) return null;
              const [x, y] = mapPt(p.x, p.z);
              return <circle key={idx} cx={x} cy={y} r={i === hud.nextCp ? 4 : 2.5} className={i < hud.nextCp ? "fill-muted-foreground" : "fill-nitro"} />;
            })}
            <circle cx={mx} cy={my} r={5} className="fill-primary" />
          </svg>
        </div>
      )}

      {/* Speedometer */}
      {inRace && (
        <div className="hud-panel digital-speedometer">
          <div className="flex items-center justify-between"><Gauge size={14} className="text-muted-foreground" /><span className={hud.boosting ? "hud-label text-nitro" : "hud-label"}>{hud.boosting ? "BOOST" : hud.drifting ? "DRIFT" : "SPEED"}</span></div>
          <div className="font-display text-5xl font-bold leading-none tabular-nums sm:text-6xl">{Math.round(hud.speed)}</div>
          <div className="hud-label mt-1 flex justify-between"><span>km/h</span><span aria-label="Gear">{hud.gear < 0 ? "R" : hud.gear === 0 ? "N" : `D${hud.gear}`}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full speed-bar transition-[width] duration-100" style={{ width: `${speedPct * 100}%` }} />
          </div>
          <div className="nitro-label"><Zap size={13} /><span>NITRO</span><span>{Math.round(hud.nitro)}%</span></div>
          <progress className="nitro-meter" max={100} value={hud.nitro} aria-label="Nitro charge" />
        </div>
      )}
      {inRace && <div className="checkpoint-progress hud-panel">
        <div className="flex justify-between"><span className="hud-label">CHECKPOINTS</span><span className="font-display text-xs text-nitro">{hud.nextCp}/{CHECKPOINTS.length}</span></div>
        <div className="flex gap-1.5 mt-1.5">{CHECKPOINTS.map((_, i) => <div key={i} className={i < hud.nextCp ? "checkpoint-pip collected" : i === hud.nextCp ? "checkpoint-pip current" : "checkpoint-pip"} />)}</div>
      </div>}

      {/* Control hints */}
      {inRace && (
        <div className="hud-panel absolute bottom-6 left-56 hidden px-4 py-3 text-xs text-muted-foreground lg:block touch:hidden">
          <div><Kbd>W</Kbd>/<Kbd>↑</Kbd> throttle · <Kbd>S</Kbd>/<Kbd>↓</Kbd> brake</div>
          <div className="mt-1"><Kbd>A</Kbd><Kbd>D</Kbd>/<Kbd>←</Kbd><Kbd>→</Kbd> steer · <Kbd>X</Kbd> drift</div>
          <div className="mt-1"><Kbd>Shift</Kbd>/<Kbd>Space</Kbd> nitro · <Kbd>P</Kbd> pause</div>
        </div>
      )}

      {/* Countdown & flashes */}
      {phase === "countdown" && hud.cd > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div key={cdNum} className="countdown font-display text-8xl font-bold text-primary sm:text-9xl">{cdNum > 0 ? cdNum : "GO!"}</div>
        </div>
      )}
      {phase === "racing" && hud.time < 0.8 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="countdown font-display text-8xl font-bold text-primary sm:text-9xl">GO!</div>
        </div>
      )}
      {flash && phase === "racing" && (
        <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center">
          <div key={flash + hud.lap} className="flash font-display text-3xl font-bold tracking-widest text-primary sm:text-4xl">{flash}</div>
        </div>
      )}

      {/* Touch controls */}
      {inRace && phase !== "paused" && <TouchControls car={car} input={touch} onChange={mergeInput} nitro={hud.nitro} />}

      {/* Rotate gate: portrait touch screens */}
      {inRace && (
        <div className="rotate-gate absolute inset-0 z-20 flex-col items-center justify-center gap-5 text-center overlay-bg">
          <RotateIcon />
          <h2 className="font-display text-3xl font-bold tracking-widest">ROTATE YOUR DEVICE</h2>
          <p className="max-w-xs text-sm text-muted-foreground">Apex Street Racer plays in landscape. Turn your phone sideways to keep racing.</p>
          <Button variant="ghost" className="btn-ghost-race" onClick={togglePause}>Pause</Button>
        </div>
      )}

      {/* Menu */}
      {phase === "menu" && (
        <Overlay>
          <div className="hud-label tracking-[0.4em]">Night Circuit · {C.LAPS} Laps</div>
          <h1 className="font-display mt-2 text-5xl font-bold italic leading-none sm:text-7xl">
            APEX <span className="text-primary">STREET</span><br />RACER
          </h1>
          <p className="mt-4 max-w-sm text-muted-foreground">Hit every checkpoint, stay off the walls, and set the fastest {C.LAPS}-lap time.</p>
          {best && <p className="mt-3 text-sm">Best time <span className="font-display font-bold text-primary tabular-nums">{fmtTime(best)}</span></p>}
          <Button variant="ghost" className="btn-race mt-6" onClick={start} disabled={!ready}>{ready ? "Start Race" : "Loading…"}</Button>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-left text-xs text-muted-foreground">
            <span><Kbd>W</Kbd>/<Kbd>↑</Kbd> Accelerate</span><span><Kbd>S</Kbd>/<Kbd>↓</Kbd> Brake / reverse</span>
            <span><Kbd>A</Kbd><Kbd>D</Kbd> Steer</span><span><Kbd>X</Kbd> Drift</span>
            <span><Kbd>P</Kbd> Pause</span><span><Kbd>Shift</Kbd>/<Kbd>Space</Kbd> Nitro</span>
          </div>
          <p className="mt-3 hidden text-xs text-muted-foreground touch:block">On touch screens, use the steering wheel and pedals.</p>
        </Overlay>
      )}

      {phase === "paused" && (
        <Overlay>
          <h2 className="font-display text-5xl font-bold">PAUSED</h2>
          <div className="mt-6 flex flex-col gap-3">
            <Button variant="ghost" className="btn-race" onClick={togglePause}>Resume</Button>
            <Button variant="ghost" className="btn-ghost-race" onClick={start}>Restart</Button>
            <Button variant="ghost" className="btn-ghost-race" onClick={toMenu}>Main Menu</Button>
          </div>
        </Overlay>
      )}

      {phase === "finished" && (
        <Overlay>
          <div className="hud-label tracking-[0.4em]">Race Complete</div>
          <h2 className="font-display mt-2 text-6xl font-bold tabular-nums text-primary">{fmtTime(race.current.time)}</h2>
          {newBest && <div className="mt-2 font-display text-lg font-bold tracking-widest">🏆 NEW PERSONAL RECORD!</div>}
          <div className="mt-4 w-56 space-y-1 text-sm">
            {race.current.lapTimes.map((t, i) => {
              const fastest = t === Math.min(...race.current.lapTimes);
              return (
                <div key={i} className="flex justify-between tabular-nums">
                  <span className="text-muted-foreground">Lap {i + 1}</span>
                  <span className={fastest ? "font-bold text-primary" : ""}>{fmtTime(t)}</span>
                </div>
              );
            })}
            {best && <div className="flex justify-between border-t border-border pt-1 tabular-nums"><span className="text-muted-foreground">Best ever</span><span>{fmtTime(best)}</span></div>}
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="ghost" className="btn-race" onClick={start}>Race Again</Button>
            <Button variant="ghost" className="btn-ghost-race" onClick={toMenu}>Menu</Button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overlay-bg p-4">
      <div className="flex flex-col items-center text-center">{children}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 inline-block min-w-5 rounded border border-border bg-muted px-1 text-center font-display text-[10px] text-foreground">{children}</kbd>;
}

function TouchControls({ car, input, onChange, nitro }: { car: React.MutableRefObject<ReturnType<typeof newCar>>; input: React.MutableRefObject<Input>; onChange: () => void; nitro: number }) {
  const bind = (k: DigitalAction) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); input.current[k] = true; onChange(); },
    onPointerUp: () => { input.current[k] = false; onChange(); },
    onPointerCancel: () => { input.current[k] = false; onChange(); },
    onLostPointerCapture: () => { input.current[k] = false; onChange(); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  return (
    <div className="touch-controls">
      <SteeringWheel car={car} input={input} onChange={onChange} />
      <div className="touch-pedals">
        <Button variant="ghost" className="touch-btn touch-btn-sm" {...bind("hb")} aria-label="Drift">DRIFT</Button>
        <Button variant="ghost" className="touch-btn touch-btn-boost" {...bind("boost")} disabled={nitro < 1} aria-label="Nitro boost"><Zap /></Button>
        <Button variant="ghost" className="touch-btn" {...bind("down")} aria-label="Brake">BRK</Button>
        <Button variant="ghost" className="touch-btn touch-btn-gas" {...bind("up")} aria-label="Accelerate">GAS</Button>
      </div>
    </div>
  );
}

const RotateIcon = () => (
  <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="rotate-icon text-primary">
    <rect x="8" y="3" width="8" height="18" rx="2" />
    <path d="M4 9.5a9 9 0 0 1 2.4-4.6" />
    <path d="M3.8 5.8 3.6 8.6 6.3 8.2" />
  </svg>
);

const SpeakerOn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></svg>
);
const SpeakerOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m22 9-6 6M16 9l6 6" /></svg>
);

export { N };
