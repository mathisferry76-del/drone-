"use client";

import { useMemo, useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// The 8 example thumbnails fanned out in 3D space, like a spread of winning
// results — not an arbitrary 3D prop (the "igloo" problem), the scene IS
// the product. Idle: gentle float + slow rotation, tilts with the mouse for
// a parallax "alive" feel. Scroll past the hero and the cards scatter
// outward like confetti instead of just fading — the "envie de scroller"
// moment the whole thing exists for.
const CARD_IDS = [
  "bold-impact",
  "golden-vacation",
  "high-contrast-drama",
  "nature-vive",
  "muay-thai-fight",
  "cyberpunk",
  "neon-pop",
  "clean-minimal",
];

const FRAME_COLORS = ["#facc15", "#d946ef", "#22d3ee"];

interface CardSpec {
  id: string;
  restPos: [number, number, number];
  restRotY: number;
  scale: number;
  explodeDir: [number, number, number];
  spin: number;
  frameColor: string;
}

function buildCards(count: number): CardSpec[] {
  const ids = CARD_IDS.slice(0, count);
  return ids.map((id, i) => {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const angle = THREE.MathUtils.lerp(-1.0, 1.0, t);
    const x = Math.sin(angle) * 3.4;
    const z = -Math.cos(angle) * 1.8 + 1.8;
    const y = Math.cos(angle * 1.4) * 0.35 - 0.15;
    const distFromCenter = Math.abs(t - 0.5) * 2; // 0 at center, 1 at edges
    const scale = 1.15 - distFromCenter * 0.5;
    // Deterministic pseudo-random explode direction so it's stable across
    // renders (no Math.random() during render).
    const seedAngle = angle * 2.3 + i * 1.7;
    return {
      id,
      restPos: [x, y, z],
      restRotY: -angle * 0.55,
      scale,
      explodeDir: [
        Math.sin(seedAngle) * 2.4,
        Math.cos(seedAngle * 1.3) * 1.6 + 1.2,
        Math.cos(seedAngle) * 1.4,
      ],
      spin: (i % 2 === 0 ? 1 : -1) * (2 + (i % 3)),
      frameColor: FRAME_COLORS[i % FRAME_COLORS.length],
    };
  });
}

function ThumbnailCard({
  spec,
  progressRef,
}: {
  spec: CardSpec;
  progressRef: React.MutableRefObject<number>;
}) {
  const texture = useTexture(`/examples/${spec.id}.webp`);
  const groupRef = useRef<THREE.Group>(null);
  const t0 = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    const p = progressRef.current;
    const bob = Math.sin(state.clock.elapsedTime * 0.8 + t0) * 0.08 * (1 - p);

    group.position.set(
      spec.restPos[0] + spec.explodeDir[0] * p,
      spec.restPos[1] + bob + spec.explodeDir[1] * p,
      spec.restPos[2] + spec.explodeDir[2] * p
    );
    group.rotation.y = spec.restRotY + p * spec.spin * 0.5;
    group.rotation.z = p * spec.spin * 0.3;
    const mat = (group.children[1] as THREE.Mesh)?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = Math.max(0, 1 - p * 1.15);
    const frameMat = (group.children[0] as THREE.Mesh)?.material as THREE.MeshBasicMaterial | undefined;
    if (frameMat) frameMat.opacity = Math.max(0, 1 - p * 1.15);
  });

  return (
    <group
      ref={groupRef}
      position={spec.restPos}
      rotation={[0, spec.restRotY, 0]}
      scale={spec.scale}
    >
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[1.72, 1.0]} />
        <meshBasicMaterial color={spec.frameColor} transparent opacity={1} />
      </mesh>
      <mesh>
        <planeGeometry args={[1.6, 0.9]} />
        <meshBasicMaterial map={texture} transparent opacity={1} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Scene({ cardCount }: { cardCount: number }) {
  const cards = useMemo(() => buildCards(cardCount), [cardCount]);
  const progressRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    function handleScroll() {
      const heroHeight = window.innerHeight;
      progressRef.current = THREE.MathUtils.clamp(window.scrollY / (heroHeight * 0.75), 0, 1);
    }
    function handleMouse(e: MouseEvent) {
      mouseRef.current = {
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5,
      };
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleMouse);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouse);
    };
  }, []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, mouseRef.current.x * 0.35, 0.04);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, mouseRef.current.y * 0.15, 0.04);
  });

  return (
    <group ref={groupRef}>
      <Suspense fallback={null}>
        {cards.map((spec) => (
          <ThumbnailCard key={spec.id} spec={spec} progressRef={progressRef} />
        ))}
      </Suspense>
    </group>
  );
}

export default function HeroScene() {
  const [cardCount, setCardCount] = useState(8);

  useEffect(() => {
    function updateCount() {
      setCardCount(window.innerWidth < 640 ? 5 : window.innerWidth < 1024 ? 6 : 8);
    }
    updateCount();
    window.addEventListener("resize", updateCount);
    return () => window.removeEventListener("resize", updateCount);
  }, []);

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5.5], fov: 45 }}
      gl={{ alpha: true, antialias: true }}
      style={{ pointerEvents: "none" }}
    >
      <Scene cardCount={cardCount} />
    </Canvas>
  );
}
