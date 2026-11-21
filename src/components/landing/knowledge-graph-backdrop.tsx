"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  computeMilestoneMastery,
  createKnowledgeGraph,
  evaluateCubicBezier,
  getEdgeControlPoints,
  projectNodePosition,
  stepKnowledgeGraph,
  type KnowledgeGraphState,
  type Point2D,
  type PulseTone,
} from "./knowledge-graph-model";

const PALETTE = {
  ember: [255, 138, 61] as const,
  emberSoft: [255, 194, 122] as const,
  iris: [143, 132, 255] as const,
  irisSoft: [195, 189, 255] as const,
  success: [79, 214, 160] as const,
  line: [106, 118, 160] as const,
};

function rgba(rgb: readonly [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
}

function toneColor(tone: PulseTone): readonly [number, number, number] {
  if (tone === "iris") return PALETTE.iris;
  if (tone === "success") return PALETTE.success;
  return PALETTE.ember;
}

function getNormalizedScroll(): number {
  const maxScroll = Math.max(
    1,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  return Math.max(0, Math.min(1, window.scrollY / maxScroll));
}

function drawFourPointSpark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outerR: number,
  innerR: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawKnowledgeGraph(
  ctx: CanvasRenderingContext2D,
  state: KnowledgeGraphState,
  width: number,
  height: number,
  scrollProgress: number,
  pointer: Point2D | null,
  reducedMotion: boolean,
) {
  ctx.clearRect(0, 0, width, height);

  const positions = state.nodes.map((node) =>
    projectNodePosition(node, width, height, scrollProgress, state.time, reducedMotion),
  );

  const pointerRadius = 210;

  // Soft ambient halos behind tutor hubs so the graph blends into the Ink & Ember backdrop.
  for (let i = 0; i < state.nodes.length; i++) {
    const node = state.nodes[i];
    if (node.role !== "tutor") continue;
    const pos = positions[i];
    const haloR = state.mode === "desktop" ? 170 : 110;
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, haloR);
    grad.addColorStop(0, rgba(PALETTE.iris, 0.08 + node.glow * 0.05));
    grad.addColorStop(1, rgba(PALETTE.iris, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Curved curriculum paths (core tracks, prerequisite bridges, and AI tutor arcs).
  for (const edge of state.edges) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) continue;

    const { cp1, cp2 } = getEdgeControlPoints(from, to, edge.curveOffset);
    let pointerBoost = 0;
    if (pointer) {
      const mid = evaluateCubicBezier(from, cp1, cp2, to, 0.5);
      const dist = Math.hypot(mid.x - pointer.x, mid.y - pointer.y);
      if (dist < pointerRadius) {
        pointerBoost = (1 - dist / pointerRadius) * 0.24;
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);

    if (edge.kind === "tutor") {
      ctx.strokeStyle = rgba(PALETTE.iris, 0.2 + pointerBoost);
      ctx.lineWidth = 1.15;
    } else if (edge.kind === "bridge") {
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = rgba(PALETTE.irisSoft, 0.14 + pointerBoost * 0.8);
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = rgba(PALETTE.line, 0.24 + pointerBoost);
      ctx.lineWidth = 1.25;
    }
    ctx.stroke();
    ctx.restore();
  }

  // Traveling knowledge pulses gliding along learning paths.
  for (const pulse of state.pulses) {
    const edge = state.edges[pulse.edgeIndex];
    if (!edge) continue;
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) continue;

    const { cp1, cp2 } = getEdgeControlPoints(from, to, edge.curveOffset);
    const rgb = toneColor(pulse.tone);
    const segments = reducedMotion ? 4 : 8;
    const startT = Math.max(0, pulse.t - pulse.tailLength);

    for (let s = 0; s < segments; s++) {
      const t0 = startT + ((pulse.t - startT) * s) / segments;
      const t1 = startT + ((pulse.t - startT) * (s + 1)) / segments;
      const a = evaluateCubicBezier(from, cp1, cp2, to, t0);
      const b = evaluateCubicBezier(from, cp1, cp2, to, t1);
      const frac = (s + 1) / segments;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = rgba(rgb, frac * (reducedMotion ? 0.35 : 0.62));
      ctx.lineWidth = 1 + frac * 1.6;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    const head = evaluateCubicBezier(from, cp1, cp2, to, pulse.t);
    const halo = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 13);
    halo.addColorStop(0, rgba(rgb, reducedMotion ? 0.45 : 0.8));
    halo.addColorStop(0.45, rgba(rgb, reducedMotion ? 0.14 : 0.28));
    halo.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(
      pulse.tone === "iris" ? PALETTE.irisSoft : PALETTE.emberSoft,
      reducedMotion ? 0.7 : 0.95,
    );
    ctx.beginPath();
    ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Typed LMS nodes: lessons, mastery milestones, and AI tutor hubs.
  for (let i = 0; i < state.nodes.length; i++) {
    const node = state.nodes[i];
    const pos = positions[i];
    const breath = reducedMotion ? 0 : Math.sin(state.time * 1.3 + node.phase) * 0.12;
    let pointerProximity = 0;
    if (pointer) {
      const dist = Math.hypot(pos.x - pointer.x, pos.y - pointer.y);
      if (dist < pointerRadius) {
        pointerProximity = 1 - dist / pointerRadius;
      }
    }
    const energy = Math.min(1, node.glow + pointerProximity * 0.55 + Math.max(0, breath));

    if (node.ripple > 0 && !reducedMotion) {
      const rippleRgb = node.role === "tutor" ? PALETTE.iris : PALETTE.success;
      const rippleR = node.radius + 4 + node.ripple * 24;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rippleR, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(rippleRgb, (1 - node.ripple) * 0.42);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    if (node.role === "milestone") {
      const mastery = computeMilestoneMastery(node, scrollProgress);
      const ringR = node.radius + 3.5;
      const ringColor = mastery > 0.72 ? PALETTE.success : PALETTE.ember;

      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, ringR * 2.5);
      glow.addColorStop(0, rgba(ringColor, 0.22 + energy * 0.22));
      glow.addColorStop(1, rgba(ringColor, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ringR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Background mastery ring track.
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(PALETTE.line, 0.42);
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Filled mastery arc.
      ctx.beginPath();
      ctx.arc(
        pos.x,
        pos.y,
        ringR,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * mastery,
      );
      ctx.strokeStyle = rgba(ringColor, 0.65 + energy * 0.3);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();

      // Inner milestone core.
      ctx.fillStyle = rgba(PALETTE.emberSoft, 0.55 + energy * 0.4);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(2.4, node.radius * 0.42), 0, Math.PI * 2);
      ctx.fill();
    } else if (node.role === "tutor") {
      const orbitR = node.radius * 1.9;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, orbitR, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(PALETTE.iris, 0.28 + energy * 0.25);
      ctx.lineWidth = 1.1;
      ctx.stroke();

      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, orbitR * 2.2);
      glow.addColorStop(0, rgba(PALETTE.iris, 0.32 + energy * 0.25));
      glow.addColorStop(1, rgba(PALETTE.iris, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, orbitR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      drawFourPointSpark(ctx, pos.x, pos.y, node.radius * 1.05, node.radius * 0.36);
      ctx.fillStyle = rgba(PALETTE.irisSoft, 0.72 + energy * 0.25);
      ctx.fill();
    } else {
      const glowR = node.radius * 3.8;
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowR);
      glow.addColorStop(0, rgba(PALETTE.ember, 0.2 + energy * 0.3));
      glow.addColorStop(1, rgba(PALETTE.ember, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba(PALETTE.emberSoft, 0.42 + energy * 0.48);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const emptySubscribe = () => () => {};

export function KnowledgeGraphBackdrop() {
  const prefersReduced = useReducedMotion() ?? false;
  // Defer reduced-motion attribute flip until post-hydration so SSR and client HTML match.
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const reduced = hydrated && prefersReduced;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = container.clientWidth || window.innerWidth || 1280;
    let height = container.clientHeight || window.innerHeight || 800;
    let mode: "desktop" | "mobile" = width < 640 ? "mobile" : "desktop";
    let graph = createKnowledgeGraph(mode);
    let scrollTarget = reduced ? 0.25 : getNormalizedScroll();
    let scrollCurrent = scrollTarget;
    let pointer: Point2D | null = null;
    let rafId: number | null = null;
    let lastTimestamp = 0;

    const resize = () => {
      width = container.clientWidth || window.innerWidth || 1280;
      height = container.clientHeight || window.innerHeight || 800;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nextMode = width < 640 ? "mobile" : "desktop";
      if (nextMode !== mode) {
        mode = nextMode;
        graph = createKnowledgeGraph(mode);
      }

      drawKnowledgeGraph(ctx, graph, width, height, scrollCurrent, pointer, reduced);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    if (reduced) {
      return () => {
        observer.disconnect();
      };
    }

    const onScroll = () => {
      scrollTarget = getNormalizedScroll();
    };

    const finePointer =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
    };
    const onPointerLeave = () => {
      pointer = null;
    };

    const tick = (timestamp: number) => {
      const dt = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 1 / 60;
      lastTimestamp = timestamp;
      scrollCurrent += (scrollTarget - scrollCurrent) * Math.min(1, dt * 6);
      stepKnowledgeGraph(graph, dt);
      drawKnowledgeGraph(ctx, graph, width, height, scrollCurrent, pointer, false);
      rafId = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (rafId !== null || document.hidden) return;
      lastTimestamp = 0;
      rafId = window.requestAnimationFrame(tick);
    };

    const stopLoop = () => {
      if (rafId === null) return;
      window.cancelAnimationFrame(rafId);
      rafId = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (finePointer) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
    }

    startLoop();

    return () => {
      stopLoop();
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (finePointer) {
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerleave", onPointerLeave);
      }
    };
  }, [reduced]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-testid="knowledge-graph-backdrop"
      data-reduced={reduced ? "true" : "false"}
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <canvas ref={canvasRef} className="block size-full" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 56% 64% at 50% 42%, rgb(8 9 13 / 0.46), transparent 84%)",
        }}
      />
    </div>
  );
}
