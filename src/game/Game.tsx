import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene } from "./Scene";
import { newCar, newRace, fmtTime, C, type Input, type Events, type Phase } from "./sim";
import { TRACK, N } from "./track";
import { Sfx } from "./audio";

type Hud = { speed: number; lap: number; time: number; cd: number; x: number; z: number; lastLap?: number | undefined };
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
  const input = useRef<Input>({ up: false, down: false, left: false, right: false, hb: false });
  const sfx = useRef(new Sfx());
  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<Hud>({ speed: 0, lap: 1, time: 0, cd: C.COUNTDOWN, x: car.current.x, z: car.current.z });
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
    lastBeep.current = 4;
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
    if (e.cp) { showFlash("CHECKPOINT"); sfx.current.beep(880, 0.08); }
    if (e.lap && !e.finished) { showFlash(r.lap === C.LAPS ? "FINAL LAP" : `LAP ${r.lap}`); sfx.current.beep(1200, 0.2); }
    if (e.finished) {
      setPhase("finished");
      sfx.current.beep(1500, 0.4);
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
    sfx.current.engine(Math.abs(c.speed) / C.MAX, input.current.up, r.phase === "racing");
    setHud({ speed: Math.abs(c.speed) * 3.6, lap: r.lap, time: r.time, cd: r.countdown, x: c.x, z: c.z, lastLap: r.lapTimes[r.lapTimes.length - 1] });
  }, []);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const map: Record<string, keyof Input> = {
      KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left",
      KeyD: "right", ArrowRight: "right", Space: "hb",
    };
    const down = (e: KeyboardEvent) => {
      const k = map[e.code]; if (k) { input.current[k] = true; e.preventDefault(); }
      if (e.code === "Escape" || e.code === "KeyP") togglePause();
      if (e.code === "Enter" && (race.current.phase === "menu" || race.current.phase === "finished")) start();
      if (e.code === "KeyR" && race.current.phase !== "menu") start();
    };
    const up = (e: KeyboardEvent) => { const k = map[e.code]; if (k) input.current[k] = false; };
    const blur = () => { Object.keys(input.current).forEach((k) => (input.current[k as keyof Input] = false)); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [start, togglePause]);

  const toggleSound = () => { const m = !muted; setMuted(m); sfx.current.setEnabled(!m); };

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
          <button className="btn-icon" onClick={toggleSound} aria-label={muted ? "Unmute sound" : "Mute sound"}>
            {muted ? <SpeakerOff /> : <SpeakerOn />}
          </button>
          {inRace && (
            <>
              <button className="btn-icon" onClick={togglePause} aria-label="Pause">{phase === "paused" ? "▶" : "❚❚"}</button>
              <button className="btn-icon" onClick={start} aria-label="Restart race">↻</button>
            </>
          )}
        </div>
      </div>

      {/* Minimap */}
      {inRace && (
        <div className="hud-panel absolute right-3 top-20 hidden p-2 sm:block sm:right-5">
          <svg width={MAP_W} height={MAP_H}>
            <polygon points={MAP_PATH} className="fill-none stroke-muted-foreground" strokeWidth={4} strokeLinejoin="round" />
            <circle cx={mapPt(TRACK.pts[0]!.x, TRACK.pts[0]!.z)[0]} cy={mapPt(TRACK.pts[0]!.x, TRACK.pts[0]!.z)[1]} r={3} className="fill-foreground" />
            <circle cx={mx} cy={my} r={5} className="fill-primary" />
          </svg>
        </div>
      )}

      {/* Speedometer */}
      {inRace && (
        <div className="hud-panel absolute bottom-4 right-3 w-40 px-4 py-3 text-right sm:bottom-6 sm:right-6 sm:w-52 landscape-touch:bottom-28">
          <div className="font-display text-5xl font-bold leading-none tabular-nums sm:text-6xl">{Math.round(hud.speed)}</div>
          <div className="hud-label mt-1">km/h</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full speed-bar transition-[width] duration-100" style={{ width: `${speedPct * 100}%` }} />
          </div>
        </div>
      )}

      {/* Control hints */}
      {inRace && (
        <div className="hud-panel absolute bottom-6 left-6 hidden px-4 py-3 text-xs text-muted-foreground lg:block touch:hidden">
          <div><Kbd>W</Kbd>/<Kbd>↑</Kbd> throttle · <Kbd>S</Kbd>/<Kbd>↓</Kbd> brake</div>
          <div className="mt-1"><Kbd>A</Kbd><Kbd>D</Kbd>/<Kbd>←</Kbd><Kbd>→</Kbd> steer · <Kbd>Space</Kbd> handbrake</div>
          <div className="mt-1"><Kbd>P</Kbd> pause · <Kbd>R</Kbd> restart</div>
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
      {inRace && phase !== "paused" && <TouchControls input={input} />}

      {/* Rotate gate: portrait touch screens */}
      {inRace && (
        <div className="rotate-gate absolute inset-0 z-20 flex-col items-center justify-center gap-5 text-center overlay-bg">
          <RotateIcon />
          <h2 className="font-display text-3xl font-bold tracking-widest">ROTATE YOUR DEVICE</h2>
          <p className="max-w-xs text-sm text-muted-foreground">Apex Street Racer plays in landscape. Turn your phone sideways to keep racing.</p>
          <button className="btn-ghost-race" onClick={togglePause}>Pause</button>
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
          <button className="btn-race mt-6" onClick={start} disabled={!ready}>{ready ? "Start Race" : "Loading…"}</button>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-left text-xs text-muted-foreground">
            <span><Kbd>W</Kbd>/<Kbd>↑</Kbd> Accelerate</span><span><Kbd>S</Kbd>/<Kbd>↓</Kbd> Brake / reverse</span>
            <span><Kbd>A</Kbd><Kbd>D</Kbd> Steer</span><span><Kbd>Space</Kbd> Handbrake</span>
            <span><Kbd>P</Kbd> Pause</span><span><Kbd>R</Kbd> Restart</span>
          </div>
          <p className="mt-3 hidden text-xs text-muted-foreground touch:block">On touch screens, use the on-screen pedals and arrows.</p>
        </Overlay>
      )}

      {phase === "paused" && (
        <Overlay>
          <h2 className="font-display text-5xl font-bold">PAUSED</h2>
          <div className="mt-6 flex flex-col gap-3">
            <button className="btn-race" onClick={togglePause}>Resume</button>
            <button className="btn-ghost-race" onClick={start}>Restart</button>
            <button className="btn-ghost-race" onClick={toMenu}>Main Menu</button>
          </div>
        </Overlay>
      )}

      {phase === "finished" && (
        <Overlay>
          <div className="hud-label tracking-[0.4em]">Race Complete</div>
          <h2 className="font-display mt-2 text-6xl font-bold tabular-nums text-primary">{fmtTime(race.current.time)}</h2>
          {newBest && <div className="mt-2 font-display text-lg font-bold tracking-widest">NEW BEST TIME!</div>}
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
            <button className="btn-race" onClick={start}>Race Again</button>
            <button className="btn-ghost-race" onClick={toMenu}>Menu</button>
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

function TouchControls({ input }: { input: React.MutableRefObject<Input> }) {
  const bind = (k: keyof Input) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); input.current[k] = true; },
    onPointerUp: () => { input.current[k] = false; },
    onPointerCancel: () => { input.current[k] = false; },
    onPointerLeave: () => { input.current[k] = false; },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  return (
    <div className="absolute inset-x-0 bottom-0 hidden items-end justify-between p-4 touch:flex" style={{ touchAction: "none" }}>
      <div className="flex gap-3">
        <button className="touch-btn" {...bind("left")} aria-label="Steer left">◀</button>
        <button className="touch-btn" {...bind("right")} aria-label="Steer right">▶</button>
      </div>
      <div className="flex items-end gap-3">
        <button className="touch-btn touch-btn-sm" {...bind("hb")} aria-label="Handbrake">HB</button>
        <button className="touch-btn" {...bind("down")} aria-label="Brake">BRK</button>
        <button className="touch-btn touch-btn-gas" {...bind("up")} aria-label="Accelerate">GAS</button>
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
