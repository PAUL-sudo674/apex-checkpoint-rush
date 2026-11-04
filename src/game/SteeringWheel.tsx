import { useEffect, useRef, type MutableRefObject, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import type { Car, Input } from "./sim";
import { angularDelta, clampWheel, easeWheel, wheelSteer, WHEEL_LIMIT } from "./steering";

export function SteeringWheel({ car, input, onChange }: { car: MutableRefObject<Car>; input: MutableRefObject<Input>; onChange: () => void }) {
  const rotor = useRef<SVGSVGElement>(null);
  const control = useRef<HTMLButtonElement>(null);
  const angle = useRef(0);
  const target = useRef(0);
  const returning = useRef(false);
  const drag = useRef<{ id: number; x: number; polar: number; cx: number; cy: number; radius: number; horizontal: boolean } | null>(null);

  useEffect(() => {
    let frame = 0, last = performance.now();
    const reset = () => {
      drag.current = null; returning.current = false; angle.current = 0; target.current = 0;
      input.current.steer = 0; onChange();
    };
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      if (drag.current || returning.current) {
        angle.current = easeWheel(angle.current, target.current, dt);
        input.current.steer = wheelSteer(angle.current); onChange();
        if (!drag.current && angle.current === 0) returning.current = false;
      } else {
        angle.current = easeWheel(angle.current, -car.current.steer * WHEEL_LIMIT, dt);
      }
      rotor.current?.style.setProperty("--wheel-angle", `${angle.current}deg`);
      control.current?.setAttribute("aria-valuenow", String(Math.round(angle.current)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener("blur", reset); document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener("blur", reset); document.removeEventListener("visibilitychange", visibility);
      input.current.steer = 0; onChange();
    };
  }, [car, input, onChange]);

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const b = e.currentTarget.getBoundingClientRect(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    drag.current = { id: e.pointerId, x: e.clientX, polar: Math.atan2(e.clientY - cy, e.clientX - cx), cx, cy, radius: b.width / 2, horizontal: Math.hypot(e.clientX - cx, e.clientY - cy) < b.width * 0.25 };
    target.current = angle.current; returning.current = false;
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const polar = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
    const delta = d.horizontal ? (e.clientX - d.x) / d.radius * WHEEL_LIMIT : angularDelta(d.polar, polar);
    target.current = clampWheel(target.current + delta); d.x = e.clientX; d.polar = polar;
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null; target.current = 0; returning.current = true;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return <Button ref={control} variant="ghost" className="steering-wheel" role="slider" aria-label="Steering wheel" aria-valuemin={-WHEEL_LIMIT} aria-valuemax={WHEEL_LIMIT} aria-valuenow={0}
    onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onContextMenu={(e) => e.preventDefault()} onKeyDown={(e) => {
      if (e.key === "Home") { target.current = 0; returning.current = true; }
    }}>
    <svg ref={rotor} className="steering-wheel-rotor" viewBox="0 0 200 200" aria-hidden="true">
      <circle className="wheel-rim-shadow" cx="100" cy="100" r="82" />
      <circle className="wheel-rim" cx="100" cy="100" r="82" />
      <path className="wheel-grips" d="M22 74a82 82 0 0 0 0 52M178 74a82 82 0 0 1 0 52" />
      <path className="wheel-spokes" d="M83 94 25 76 23 98 82 111ZM117 94 175 76 177 98 118 111ZM88 115 84 179 116 179 112 115Z" />
      <path className="wheel-marker" d="M100 15v17" />
      <circle className="wheel-hub" cx="100" cy="100" r="30" />
      <circle className="wheel-hub-ring" cx="100" cy="100" r="23" />
      <path className="wheel-emblem" d="m87 110 13-22 13 22M93 102h14" />
    </svg>
  </Button>;
}