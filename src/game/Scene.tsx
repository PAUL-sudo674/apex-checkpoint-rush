import { useMemo, useRef, useLayoutEffect, useEffect, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { DrivingEffects, radialTexture, type EffectsHandle } from "./Effects";
import { sceneColor } from "./palette";
import { TRACK, N, HALF, CHECKPOINTS } from "./track";
import { createPhysicsClock, C, type Car, type Race, type Input, type Events } from "./sim";

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const context = c.getContext("2d");
  if (context) draw(context);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ribbon(a: number, b: number, vLen: number, y: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const p = TRACK.pts[i % N]!;
    const d = i === N ? TRACK.length : p.d;
    pos.push(p.x + p.nx * a, y, p.z + p.nz * a, p.x + p.nx * b, y, p.z + p.nz * b);
    uv.push(0, d / vLen, 1, d / vLen);
    if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function Track() {
  const { road, curbL, curbR, roadTex, curbTex } = useMemo(() => {
    const roadTex = canvasTex(256, 512, (g) => {
      g.fillStyle = "#2b2c31"; g.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 4000; i++) {
        const v = 30 + Math.random() * 40;
        g.fillStyle = `rgb(${v},${v},${v + 4})`;
        g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
      }
      g.fillStyle = "#e8e6df"; g.fillRect(8, 0, 6, 512); g.fillRect(242, 0, 6, 512);
      g.fillStyle = "#f2b234"; g.fillRect(125, 0, 6, 260);
    });
    const curbTex = canvasTex(16, 64, (g) => {
      g.fillStyle = "#d63a2a"; g.fillRect(0, 0, 16, 32);
      g.fillStyle = "#f1efe8"; g.fillRect(0, 32, 16, 32);
    });
    return {
      road: ribbon(-HALF, HALF, 18, 0.02),
      curbL: ribbon(-HALF - 1.4, -HALF, 4, 0.04),
      curbR: ribbon(HALF, HALF + 1.4, 4, 0.04),
      roadTex, curbTex,
    };
  }, []);
  return (
    <group>
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial map={roadTex} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={curbL}><meshStandardMaterial map={curbTex} roughness={0.6} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={curbR}><meshStandardMaterial map={curbTex} roughness={0.6} side={THREE.DoubleSide} /></mesh>
      <StartGantry />
    </group>
  );
}

function StartGantry() {
  const p = TRACK.pts[0]!;
  const tex = useMemo(() => canvasTex(256, 32, (g) => {
    for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? "#111" : "#eee"; g.fillRect(x * 8, y * 8, 8, 8);
    }
  }, false), []);
  const lineTex = useMemo(() => canvasTex(256, 16, (g) => {
    for (let x = 0; x < 32; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? "#111" : "#eee"; g.fillRect(x * 8, y * 8, 8, 8);
    }
  }, false), []);
  const rot = Math.atan2(p.tx, p.tz);
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, rot, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <planeGeometry args={[HALF * 2, 2]} />
        <meshStandardMaterial map={lineTex} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HALF + 2), 3.5, 0]}>
          <boxGeometry args={[0.6, 7, 0.6]} />
          <meshStandardMaterial color="#30323a" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 7, 0]}>
        <boxGeometry args={[HALF * 2 + 4.6, 1.4, 0.5]} />
        <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function Scenery() {
  const refs = {
    trunk: useRef<THREE.InstancedMesh>(null),
    crown: useRef<THREE.InstancedMesh>(null),
    bld: useRef<THREE.InstancedMesh>(null),
    pole: useRef<THREE.InstancedMesh>(null),
    lamp: useRef<THREE.InstancedMesh>(null),
  };
  const data = useMemo(() => {
    const r = rng(7);
    const clear = (x: number, z: number, min: number) => {
      for (let i = 0; i < N; i += 3) {
        const p = TRACK.pts[i]!;
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < min * min) return false;
      }
      return true;
    };
    const trees: [number, number, number][] = [], blds: [number, number, number, number, number, number][] = [], lamps: [number, number][] = [];
    for (let k = 0; k < 900 && trees.length < 260; k++) {
      const p = TRACK.pts[Math.floor(r() * N)]!;
      const s = r() < 0.5 ? -1 : 1, off = HALF + 6 + r() * 40;
      const x = p.x + p.nx * off * s, z = p.z + p.nz * off * s;
      if (clear(x, z, HALF + 5)) trees.push([x, z, 0.8 + r() * 0.9]);
    }
    for (let k = 0; k < 600 && blds.length < 90; k++) {
      const p = TRACK.pts[Math.floor(r() * N)]!;
      const s = r() < 0.5 ? -1 : 1, off = HALF + 40 + r() * 70;
      const x = p.x + p.nx * off * s, z = p.z + p.nz * off * s;
      const w = 10 + r() * 14, h = 12 + r() * 50;
      if (clear(x, z, HALF + w)) blds.push([x, z, w, h, 10 + r() * 14, r() * Math.PI]);
    }
    for (let i = 0; i < N; i += 16) {
      const p = TRACK.pts[i]!;
      const s = (i / 16) % 2 ? 1 : -1, off = HALF + 2.6;
      lamps.push([p.x + p.nx * off * s, p.z + p.nz * off * s]);
    }
    return { trees, blds, lamps };
  }, []);
  const winTex = useMemo(() => canvasTex(64, 128, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
      if (Math.random() < 0.35) { g.fillStyle = Math.random() < 0.7 ? "#ffcf7a" : "#9fd3ff"; g.fillRect(x, y, 4, 4); }
    }
  }), []);

  useLayoutEffect(() => {
    const m = new THREE.Object3D();
    const col = new THREE.Color();
    data.trees.forEach(([x, z, s], i) => {
      m.position.set(x, 1.5 * s, z); m.scale.set(s, s, s); m.rotation.set(0, 0, 0); m.updateMatrix();
      refs.trunk.current!.setMatrixAt(i, m.matrix);
      m.position.set(x, 4.5 * s, z); m.updateMatrix();
      refs.crown.current!.setMatrixAt(i, m.matrix);
      refs.crown.current!.setColorAt(i, col.setHSL(0.3 + (s - 1) * 0.08, 0.35, 0.18 + (s - 0.8) * 0.06));
    });
    data.blds.forEach(([x, z, w, h, d, ry], i) => {
      m.position.set(x, h / 2, z); m.scale.set(w, h, d); m.rotation.set(0, ry, 0); m.updateMatrix();
      refs.bld.current!.setMatrixAt(i, m.matrix);
      refs.bld.current!.setColorAt(i, col.setHSL(0.62, 0.08, 0.12 + (i % 5) * 0.025));
    });
    m.scale.set(1, 1, 1); m.rotation.set(0, 0, 0);
    data.lamps.forEach(([x, z], i) => {
      m.position.set(x, 3.5, z); m.updateMatrix(); refs.pole.current!.setMatrixAt(i, m.matrix);
      m.position.set(x, 7.1, z); m.updateMatrix(); refs.lamp.current!.setMatrixAt(i, m.matrix);
    });
    Object.values(refs).forEach((r) => {
      r.current!.instanceMatrix.needsUpdate = true;
      if (r.current!.instanceColor) r.current!.instanceColor.needsUpdate = true;
    });
  }, [data]);

  return (
    <group>
      <instancedMesh ref={refs.trunk} args={[undefined, undefined, data.trees.length]}>
        <cylinderGeometry args={[0.25, 0.35, 3, 6]} />
        <meshStandardMaterial color="#3b2a1f" />
      </instancedMesh>
      <instancedMesh ref={refs.crown} args={[undefined, undefined, data.trees.length]}>
        <coneGeometry args={[2, 5, 7]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={refs.bld} args={[undefined, undefined, data.blds.length]}>
        <boxGeometry />
        <meshStandardMaterial emissive="#ffffff" emissiveMap={winTex} emissiveIntensity={1.1} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={refs.pole} args={[undefined, undefined, data.lamps.length]}>
        <cylinderGeometry args={[0.1, 0.14, 7, 6]} />
        <meshStandardMaterial color="#454852" metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={refs.lamp} args={[undefined, undefined, data.lamps.length]}>
        <sphereGeometry args={[0.35, 10, 8]} />
        <meshStandardMaterial color="#ffd89a" emissive="#ffb85c" emissiveIntensity={3} />
      </instancedMesh>
    </group>
  );
}

function Ground() {
  const tex = useMemo(() => {
    const t = canvasTex(256, 256, (g) => {
      g.fillStyle = "#1c2419"; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 6000; i++) {
        const v = Math.random();
        g.fillStyle = `rgba(${40 + v * 30},${55 + v * 35},${35 + v * 20},0.6)`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
    });
    t.repeat.set(120, 120);
    return t;
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 200]} receiveShadow>
      <planeGeometry args={[1600, 1600]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

function CarModel({ carRef, wheels }: { carRef: MutableRefObject<THREE.Group | null>; wheels: MutableRefObject<THREE.Group[]> }) {
  const shadowTex = useMemo(radialTexture, []);
  const glowColor = useMemo(() => sceneColor("--headlight"), []);
  const shadowColor = useMemo(() => sceneColor("--background"), []);
  const paint = { color: "#e2551d", metalness: 0.6, roughness: 0.25 } as const;
  const wheelPos: [number, number, number][] = [[-0.95, 0.38, 1.35], [0.95, 0.38, 1.35], [-0.95, 0.38, -1.3], [0.95, 0.38, -1.3]];
  return (
    <group ref={carRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[4.2, 6.8]} />
        <meshBasicMaterial map={shadowTex} color={shadowColor} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.9, 0.5, 4.3]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      <mesh position={[0, 0.78, 1.55]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[1.85, 0.25, 1.3]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      <mesh position={[0, 1.08, -0.25]}>
        <boxGeometry args={[1.5, 0.48, 2]} />
        <meshStandardMaterial color="#111318" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 1.36, -0.3]}>
        <boxGeometry args={[1.4, 0.08, 1.6]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      <mesh position={[0, 1.15, -2.05]}>
        <boxGeometry args={[1.9, 0.08, 0.45]} />
        <meshStandardMaterial color="#15161a" />
      </mesh>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.95, -2.05]}><boxGeometry args={[0.08, 0.35, 0.2]} /><meshStandardMaterial color="#15161a" /></mesh>
      ))}
      {[-0.65, 0.65].map((x) => (
        <group key={x}>
          <sprite position={[x, 0.65, 2.23]} scale={[1.1, 1.1, 1]}><spriteMaterial map={shadowTex} color={glowColor} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} /></sprite>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.06, 6]}><planeGeometry args={[3.5, 9]} /><meshBasicMaterial map={shadowTex} color={glowColor} transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
          <mesh position={[x, 0.65, 2.16]}><boxGeometry args={[0.5, 0.14, 0.05]} /><meshStandardMaterial color="#fff" emissive="#fff4d6" emissiveIntensity={4} /></mesh>
          <mesh position={[x, 0.68, -2.16]}><boxGeometry args={[0.55, 0.12, 0.05]} /><meshStandardMaterial color="#f00" emissive="#ff1a1a" emissiveIntensity={4} /></mesh>
        </group>
      ))}
      {wheelPos.map((p, i) => (
        <group key={i} position={p} ref={(g) => { if (g) wheels.current[i] = g; }}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.38, 0.38, 0.32, 16]} />
            <meshStandardMaterial color="#141414" roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[p[0] > 0 ? 0.17 : -0.17, 0, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.02, 6]} />
            <meshStandardMaterial color="#9aa0a8" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export type SceneProps = {
  car: MutableRefObject<Car>;
  race: MutableRefObject<Race>;
  input: MutableRefObject<Input>;
  onEvents: (e: Events) => void;
  onHud: () => void;
  onReady: () => void;
};

export function Scene({ car, race, input, onEvents, onHud, onReady }: SceneProps) {
  const carRef = useRef<THREE.Group | null>(null);
  const wheels = useRef<THREE.Group[]>([]);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const hudT = useRef(0);
  const ready = useRef(false);
  const camInit = useRef(false);
  const spin = useRef(0);
  const clock = useRef(createPhysicsClock());
  const effects = useRef<EffectsHandle>(null);
  const shake = useRef(0);
  const shakeOffset = useRef(new THREE.Vector3());
  const desired = useMemo(() => new THREE.Vector3(), []);
  const reducedMotion = useRef(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reducedMotion.current = query.matches; };
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, C.MAX_FRAME);
    clock.current.advance(car.current, race.current, input.current, dt, (ev) => {
      onEvents(ev);
      if (ev.wall) shake.current = 0.3;
    });
    const pose = clock.current.pose(car.current);
    const c = car.current;
    effects.current?.update(c, input.current, dt, race.current.phase === "racing");

    const g = carRef.current;
    if (g) {
      g.position.set(pose.x, 0, pose.z);
      g.rotation.set(0, pose.h, -c.steer * Math.min(Math.abs(c.speed) / C.MAX, 1) * 0.05);
      spin.current += (c.speed * dt) / 0.38;
      wheels.current.forEach((w, i) => {
        w.rotation.set(spin.current, i < 2 ? c.steeringAngle : 0, 0, "YXZ");
      });
    }

    const fx = Math.sin(pose.h), fz = Math.cos(pose.h);
    const distance = 9 + Math.min(Math.abs(c.speed) / C.BOOST_MAX, 1) * 3;
    desired.set(pose.x - fx * distance, 3.6 + Math.abs(c.speed) / C.BOOST_MAX, pose.z - fz * distance);
    camera.position.sub(shakeOffset.current);
    if (!camInit.current) { camera.position.copy(desired); camInit.current = true; }
    camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    shake.current = Math.max(0, shake.current - dt);
    const amplitude = reducedMotion.current ? 0 : shake.current * 0.75;
    shakeOffset.current.set(Math.sin(shake.current * 130) * amplitude, Math.cos(shake.current * 110) * amplitude * 0.65, 0);
    camera.position.add(shakeOffset.current);
    camera.lookAt(pose.x + fx * 5, 1.2, pose.z + fz * 5);
    const fov = 62 + (Math.abs(c.speed) / C.MAX) * 14;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-3 * dt)); camera.updateProjectionMatrix(); }

    hudT.current += delta;
    if (hudT.current > 0.08) { hudT.current = 0; onHud(); }
    if (!ready.current) { ready.current = true; onReady(); }
  });

  return (
    <>
      <color attach="background" args={["#1a1d2e"]} />
      <fog attach="fog" args={["#2a2536", 60, 420]} />
      <hemisphereLight args={["#8a9ccf", "#2a2218", 0.7]} />
      <directionalLight position={[-120, 80, -60]} intensity={1.4} color="#ffb67a" />
      <Environment resolution={64}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1.5} color="#ff9a55" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={1} color="#6b8cff" position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
      <SkyDome />
      <Ground />
      <Track />
      <Scenery />
      <CarModel carRef={carRef} wheels={wheels} />
      <DrivingEffects ref={effects} />
      <CheckpointGates race={race} />
    </>
  );
}

function SkyDome() {
  const tex = useMemo(() => canvasTex(4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#0b0e1c"); gr.addColorStop(0.45, "#2b2a4a"); gr.addColorStop(0.7, "#b0533a"); gr.addColorStop(0.82, "#e88a4a"); gr.addColorStop(1, "#2a2536");
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  }, false), []);
  return (
    <mesh position={[0, 0, 200]}>
      <sphereGeometry args={[700, 32, 16]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} />
    </mesh>
  );
}

function CheckpointGates({ race }: { race: MutableRefObject<Race> }) {
  const refs = useRef<THREE.Group[]>([]);
  const texture = useMemo(radialTexture, []);
  const color = useMemo(() => sceneColor("--nitro"), []);
  const base = useMemo(() => sceneColor("--primary"), []);
  useFrame(() => {
    refs.current.forEach((group, i) => {
      group.visible = race.current.phase !== "menu" && i >= race.current.nextCp;
      group.scale.setScalar(i === race.current.nextCp ? 1 : 0.85);
    });
  });
  return <group>{CHECKPOINTS.map((idx, i) => {
    const p = TRACK.pts[idx];
    if (!p) return null;
    return <group key={idx} ref={(g) => { if (g) refs.current[i] = g; }} position={[p.x, 0, p.z]} rotation={[0, Math.atan2(p.tx, p.tz), 0]}>
      {[-1, 1].map((side) => <group key={side} position={[side * (HALF + 0.6), 0, 0]}>
        <mesh position={[0, 2.5, 0]}><boxGeometry args={[0.18, 5, 0.18]} /><meshStandardMaterial color={base} emissive={color} emissiveIntensity={3} /></mesh>
        <sprite position={[0, 2.5, 0]} scale={[2, 7, 1]}><spriteMaterial map={texture} color={color} transparent opacity={0.65} blending={THREE.AdditiveBlending} depthWrite={false} /></sprite>
      </group>)}
      <mesh position={[0, 5, 0]}><boxGeometry args={[HALF * 2 + 1.4, 0.12, 0.12]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]}><planeGeometry args={[HALF * 2, 4]} /><meshBasicMaterial map={texture} color={color} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
    </group>;
  })}</group>;
}
