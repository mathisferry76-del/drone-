"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import * as THREE from "three";

// A single continuous scroll-driven camera flight through five scenes:
// clouds -> house exterior -> bedroom -> gaming PC -> monitor screen
// (which reveals a real MIN IA thumbnail). Everything is built from plain
// primitives in a flat-shaded, saturated style — not an attempt at realism,
// a deliberate low-poly look, so there's no 3D-asset sourcing dependency
// and it stays light enough to run smoothly.
//
// `progressRef` is written by the parent (HeroJourney) from a scroll
// listener and read here every frame in useFrame — never through React
// state/props per frame, so scrolling doesn't trigger React re-renders.

// --- deterministic pseudo-random (no Math.random() during render) ---
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowOpacity(
  t: number,
  fadeInStart: number,
  fadeInEnd: number,
  fadeOutStart: number,
  fadeOutEnd: number
): number {
  if (t <= fadeInStart || t >= fadeOutEnd) return 0;
  if (t < fadeInEnd) return THREE.MathUtils.smoothstep(t, fadeInStart, fadeInEnd);
  if (t > fadeOutStart) return 1 - THREE.MathUtils.smoothstep(t, fadeOutStart, fadeOutEnd);
  return 1;
}

interface ColorStop {
  t: number;
  color: [number, number, number];
}

function sampleColorStops(t: number, stops: ColorStop[], out: THREE.Color) {
  if (t <= stops[0].t) {
    out.setRGB(...stops[0].color);
    return;
  }
  const last = stops[stops.length - 1];
  if (t >= last.t) {
    out.setRGB(...last.color);
    return;
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const localT = (t - a.t) / (b.t - a.t);
      out.setRGB(
        THREE.MathUtils.lerp(a.color[0], b.color[0], localT),
        THREE.MathUtils.lerp(a.color[1], b.color[1], localT),
        THREE.MathUtils.lerp(a.color[2], b.color[2], localT)
      );
      return;
    }
  }
}

const SKY_STOPS: ColorStop[] = [
  { t: 0.0, color: [0.55, 0.75, 0.95] },
  { t: 0.22, color: [0.85, 0.6, 0.4] },
  { t: 0.4, color: [0.35, 0.22, 0.3] },
  { t: 0.47, color: [0.06, 0.05, 0.09] },
  { t: 1.0, color: [0.05, 0.04, 0.08] },
];

// --- camera path: a handful of keyframes, lerped + eased between them ---
interface CamKey {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
}

// Depth budget, kept consistent between the camera and every scene so
// nothing ever ends up behind geometry that should be occluding it: the
// house door sits around z=-1.5, the bedroom's back wall at z=-4.5 (the
// deepest point in the whole journey), and the desk/PC in front of that
// wall at roughly z=-3.5 — the camera's last keyframes stay in front of
// the PC group, never approaching (let alone crossing) the wall behind it.
const CAM_KEYS: CamKey[] = [
  { t: 0.0, pos: [0, 6, 15], look: [0, 3.5, 0] },
  { t: 0.16, pos: [0, 3.2, 8.5], look: [0, 1.8, 0] },
  { t: 0.3, pos: [0, 1.7, 5.2], look: [0, 1.3, -2] },
  { t: 0.46, pos: [0.3, 1.5, -2.0], look: [0.5, 1.4, -3.0] },
  { t: 0.55, pos: [0.5, 1.35, -2.4], look: [0.7, 1.3, -3.2] },
  { t: 0.68, pos: [0.8, 1.28, -2.8], look: [1.0, 1.25, -3.4] },
  // Hold here long enough to actually see the whole revealed thumbnail
  // clearly before pushing into the final close-up — the crossfade to the
  // real image finishes at t=0.77 (see GamingSetup), just before this.
  { t: 0.8, pos: [1.05, 1.25, -2.6], look: [1.2, 1.25, -3.55] },
  { t: 0.92, pos: [1.13, 1.25, -3.1], look: [1.2, 1.25, -3.55] },
  { t: 1.0, pos: [1.18, 1.25, -3.42], look: [1.2, 1.25, -3.6] },
];

function sampleCamera(t: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  if (clamped <= CAM_KEYS[0].t) {
    outPos.set(...CAM_KEYS[0].pos);
    outLook.set(...CAM_KEYS[0].look);
    return;
  }
  const last = CAM_KEYS[CAM_KEYS.length - 1];
  if (clamped >= last.t) {
    outPos.set(...last.pos);
    outLook.set(...last.look);
    return;
  }
  for (let i = 0; i < CAM_KEYS.length - 1; i++) {
    const a = CAM_KEYS[i];
    const b = CAM_KEYS[i + 1];
    if (clamped >= a.t && clamped <= b.t) {
      const localT = THREE.MathUtils.smoothstep(clamped, a.t, b.t);
      outPos.set(
        THREE.MathUtils.lerp(a.pos[0], b.pos[0], localT),
        THREE.MathUtils.lerp(a.pos[1], b.pos[1], localT),
        THREE.MathUtils.lerp(a.pos[2], b.pos[2], localT)
      );
      outLook.set(
        THREE.MathUtils.lerp(a.look[0], b.look[0], localT),
        THREE.MathUtils.lerp(a.look[1], b.look[1], localT),
        THREE.MathUtils.lerp(a.look[2], b.look[2], localT)
      );
      return;
    }
  }
}

function CameraRig({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const { camera, scene } = useThree();
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const skyColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    scene.fog = new THREE.FogExp2(0x000000, 0.05);
  }, [scene]);

  useFrame(() => {
    const t = progressRef.current;
    sampleCamera(t, pos, look);
    camera.position.copy(pos);
    camera.lookAt(look);

    sampleColorStops(t, SKY_STOPS, skyColor);
    if (!scene.background || !(scene.background instanceof THREE.Color)) {
      scene.background = new THREE.Color();
    }
    (scene.background as THREE.Color).copy(skyColor);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(skyColor);
      // Denser fog indoors (small scene, want atmosphere close-in); lighter
      // outdoors so the house/clouds read clearly from a distance.
      scene.fog.density = THREE.MathUtils.lerp(0.02, 0.09, THREE.MathUtils.smoothstep(t, 0.3, 0.5));
    }
  });

  return null;
}

function useCloudTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);
}

function Clouds({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const texture = useCloudTexture();
  const groupRef = useRef<THREE.Group>(null);
  const materialsRef = useRef<THREE.SpriteMaterial[]>([]);

  const puffs = useMemo(() => {
    const rand = mulberry32(7);
    return Array.from({ length: 26 }, () => ({
      pos: [
        (rand() - 0.5) * 16,
        rand() * 5 + 1,
        (rand() - 0.5) * 10 + 2,
      ] as [number, number, number],
      scale: rand() * 2.5 + 1.5,
    }));
  }, []);

  useFrame((state) => {
    const t = progressRef.current;
    const opacity = windowOpacity(t, -0.01, 0.02, 0.26, 0.36);
    materialsRef.current.forEach((mat, i) => {
      if (mat) mat.opacity = opacity;
    });
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      {puffs.map((p, i) => (
        <sprite key={i} position={p.pos} scale={[p.scale, p.scale * 0.6, 1]}>
          <spriteMaterial
            ref={(m) => {
              if (m) materialsRef.current[i] = m;
            }}
            map={texture}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

function fadeGroup(group: THREE.Group | null, opacity: number) {
  if (!group) return;
  group.visible = opacity > 0.003;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = child.material as THREE.Material & { opacity?: number; transparent?: boolean };
      mat.transparent = true;
      mat.opacity = opacity;
    }
  });
}

function HouseExterior({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    fadeGroup(groupRef.current, windowOpacity(progressRef.current, 0.18, 0.28, 0.38, 0.44));
  });

  return (
    <group ref={groupRef} position={[0, 0, -3]}>
      <mesh position={[0, -0.02, 3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color="#3a7d44" flatShading />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[4, 2.2, 3]} />
        <meshStandardMaterial color="#d8b98c" flatShading />
      </mesh>
      <mesh position={[0, 2.9, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3.1, 1.5, 4]} />
        <meshStandardMaterial color="#7a3b2e" flatShading />
      </mesh>
      <mesh position={[0, 0.75, 1.51]}>
        <planeGeometry args={[0.8, 1.5]} />
        <meshStandardMaterial color="#3a2418" />
      </mesh>
      <mesh position={[-1.2, 1.3, 1.51]}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial color="#ffd27a" toneMapped={false} />
      </mesh>
      <mesh position={[1.2, 1.3, 1.51]}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial color="#ffd27a" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Bedroom({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    fadeGroup(groupRef.current, windowOpacity(progressRef.current, 0.48, 0.56, 0.9, 1.01));
  });

  return (
    <group ref={groupRef} position={[0.6, 0, -4.5]}>
      <mesh position={[0, 1.5, 0]} rotation={[0, 0, 0]}>
        <planeGeometry args={[10, 5]} />
        <meshStandardMaterial color="#5b4a6b" flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.02, 3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 8]} />
        <meshStandardMaterial color="#6b4a2f" flatShading />
      </mesh>
      <mesh position={[-2.6, 1.6, 0.3]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial color="#8fa8d8" toneMapped={false} />
      </mesh>
      <mesh position={[-2.6, 0.5, 2.2]}>
        <boxGeometry args={[1.8, 0.6, 2.6]} />
        <meshStandardMaterial color="#7a2d3d" flatShading />
      </mesh>
      <mesh position={[-2.6, 0.85, 1.2]}>
        <boxGeometry args={[1.9, 0.15, 0.7]} />
        <meshStandardMaterial color="#e8e0d5" flatShading />
      </mesh>
    </group>
  );
}

function GamingSetup({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const rgbRefs = useRef<THREE.MeshBasicMaterial[]>([]);
  const screenGlowRef = useRef<THREE.MeshBasicMaterial>(null);
  const screenImgRef = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useLoader(THREE.TextureLoader, "/examples/bold-impact.webp");

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
  }, [texture]);

  useFrame((state) => {
    const t = progressRef.current;
    fadeGroup(groupRef.current, windowOpacity(t, 0.56, 0.66, 1.5, 1.6));

    const hue = (state.clock.elapsedTime * 0.15) % 1;
    const rgbColor = new THREE.Color().setHSL(hue, 0.85, 0.55);
    rgbRefs.current.forEach((mat) => mat && mat.color.copy(rgbColor));

    const screenT = THREE.MathUtils.smoothstep(t, 0.68, 0.77);
    if (screenGlowRef.current) screenGlowRef.current.opacity = (1 - screenT) * windowOpacity(t, 0.56, 0.66, 1.5, 1.6);
    if (screenImgRef.current) screenImgRef.current.opacity = screenT * windowOpacity(t, 0.56, 0.66, 1.5, 1.6);
  });

  return (
    <group ref={groupRef} position={[0.9, 0.9, -3.5]}>
      {/* desk surface just below */}
      <mesh position={[0, -0.4, 0.3]}>
        <boxGeometry args={[2.4, 0.08, 1]} />
        <meshStandardMaterial color="#3a2f28" flatShading />
      </mesh>
      {/* tower */}
      <mesh position={[-0.9, 0.1, 0]}>
        <boxGeometry args={[0.4, 1.0, 0.9]} />
        <meshStandardMaterial color="#141416" flatShading />
      </mesh>
      <mesh
        position={[-0.9, 0.1, 0.46]}
        ref={(m) => {
          if (m) rgbRefs.current[0] = m.material as THREE.MeshBasicMaterial;
        }}
      >
        <planeGeometry args={[0.06, 0.9]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      {/* monitor stand */}
      <mesh position={[0.3, -0.15, -0.1]}>
        <boxGeometry args={[0.18, 0.3, 0.18]} />
        <meshStandardMaterial color="#1c1c1e" flatShading />
      </mesh>
      {/* monitor frame */}
      <mesh position={[0.3, 0.35, -0.1]}>
        <boxGeometry args={[1.5, 0.9, 0.08]} />
        <meshStandardMaterial color="#0c0c0e" flatShading />
      </mesh>
      {/* screen glow (pre-reveal) */}
      <mesh position={[0.3, 0.35, -0.055]}>
        <planeGeometry args={[1.36, 0.78]} />
        <meshBasicMaterial ref={screenGlowRef} color="#7dd3fc" toneMapped={false} transparent opacity={0} />
      </mesh>
      {/* screen image (the reveal) */}
      <mesh position={[0.3, 0.35, -0.05]}>
        <planeGeometry args={[1.36, 0.78]} />
        <meshBasicMaterial
          ref={screenImgRef}
          map={texture}
          toneMapped={false}
          transparent
          opacity={0}
        />
      </mesh>
      {/* RGB strip under the desk edge, second accent light */}
      <mesh
        position={[0.3, -0.44, 0.75]}
        ref={(m) => {
          if (m) rgbRefs.current[1] = m.material as THREE.MeshBasicMaterial;
        }}
      >
        <boxGeometry args={[2.4, 0.02, 0.02]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
    </group>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 5]} intensity={0.6} />
      <pointLight position={[1.1, 1.2, -5]} intensity={1.2} color="#7dd3fc" distance={4} />
    </>
  );
}

export default function JourneyScene({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 6, 15], fov: 50 }}
      gl={{ antialias: true }}
    >
      <SceneLights />
      <CameraRig progressRef={progressRef} />
      <Clouds progressRef={progressRef} />
      <HouseExterior progressRef={progressRef} />
      <Bedroom progressRef={progressRef} />
      <Suspense fallback={null}>
        <GamingSetup progressRef={progressRef} />
      </Suspense>
    </Canvas>
  );
}
