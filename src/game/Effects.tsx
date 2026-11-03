import { useMemo, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import type { Car, Input } from "./sim";
import { sceneColor } from "./palette";

export type EffectsHandle = { update: (car: Car, input: Input, dt: number, active: boolean) => void };

export function radialTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,0.7)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

export const DrivingEffects = forwardRef<EffectsHandle>(function DrivingEffects(_, ref) {
  const smoke = useRef<THREE.InstancedMesh>(null);
  const marks = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => ({
    puffs: Array.from({ length: 64 }, () => ({ x: 0, z: 0, y: -100, age: 10 })),
    marks: Array.from({ length: 160 }, () => ({ x: 0, z: 0, h: 0, age: 40 })),
    tex: radialTexture(), smokeColor: sceneColor("--muted-foreground"), markColor: sceneColor("--background"),
    matrix: new THREE.Object3D(), puffIndex: 0, markIndex: 0, emit: 0,
  }), []);
  useImperativeHandle(ref, () => ({ update(car, input, dt, active) {
    data.emit += active ? dt : 0;
    if (active && data.emit > 0.045 && Math.abs(car.speed) > 4) {
      data.emit = 0;
      for (const side of [-1, 1]) {
        const x = car.x - Math.sin(car.h) * 1.4 + Math.cos(car.h) * side * 0.9;
        const z = car.z - Math.cos(car.h) * 1.4 - Math.sin(car.h) * side * 0.9;
        if (input.up || car.drifting) {
          Object.assign(data.puffs[data.puffIndex % 64] ?? {}, { x, z, y: 0.3, age: 0 });
          data.puffIndex++;
        }
        if (car.drifting || (Math.abs(car.slip) > 0.075 && Math.abs(car.speed) > 15)) {
          Object.assign(data.marks[data.markIndex % 160] ?? {}, { x, z, h: Math.atan2(car.vx, car.vz), age: 0 });
          data.markIndex++;
        }
      }
    }
    data.puffs.forEach((p, i) => {
      if (active) { p.age += dt; p.y += dt * 0.6; }
      const size = p.age < 1.5 ? (0.35 + p.age * 1.4) * Math.max(0, 1 - p.age / 1.5) : 0;
      data.matrix.position.set(p.x, p.y, p.z);
      data.matrix.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
      data.matrix.scale.setScalar(size); data.matrix.updateMatrix();
      smoke.current?.setMatrixAt(i, data.matrix.matrix);
    });
    data.marks.forEach((p, i) => {
      if (active) p.age += dt;
      data.matrix.position.set(p.x, 0.045, p.z);
      data.matrix.rotation.set(-Math.PI / 2, 0, -p.h);
      data.matrix.scale.set(p.age < 30 ? 0.25 : 0, 1.6, 1); data.matrix.updateMatrix();
      marks.current?.setMatrixAt(i, data.matrix.matrix);
    });
    if (smoke.current) smoke.current.instanceMatrix.needsUpdate = true;
    if (marks.current) marks.current.instanceMatrix.needsUpdate = true;
  } }), [data]);
  return <>
    <instancedMesh ref={smoke} args={[undefined, undefined, 64]} frustumCulled={false}>
      <planeGeometry /><meshBasicMaterial map={data.tex} color={data.smokeColor} transparent opacity={0.42} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
    <instancedMesh ref={marks} args={[undefined, undefined, 160]} frustumCulled={false}>
      <planeGeometry /><meshBasicMaterial color={data.markColor} transparent opacity={0.65} depthWrite={false} />
    </instancedMesh>
  </>;
});