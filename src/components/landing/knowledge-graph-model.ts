export type NodeRole = "lesson" | "milestone" | "tutor";

export type EdgeKind = "track" | "bridge" | "tutor";

export type PulseTone = "ember" | "iris" | "success";

export type Point2D = {
  x: number;
  y: number;
};

export type GraphNode = {
  id: number;
  track: number;
  role: NodeRole;
  /** Normalized x in [0, 1]. */
  x: number;
  /** Normalized y in [0, 1.32] to allow smooth scroll parallax. */
  y: number;
  /** Parallax depth factor in [0.4, 1]. */
  depth: number;
  radius: number;
  /** Base mastery ring progress in [0.25, 0.85] for milestone nodes. */
  baseMastery: number;
  /** Phase offset for subtle ambient breathing. */
  phase: number;
  /** Dynamic arrival illumination in [0, 1]. */
  glow: number;
  /** Expanding arrival ripple progress in [0, 1]; 0 when inactive. */
  ripple: number;
};

export type GraphEdge = {
  id: number;
  from: number;
  to: number;
  kind: EdgeKind;
  /** Perpendicular curvature offset applied to Bezier control points. */
  curveOffset: number;
};

export type KnowledgePulse = {
  id: number;
  edgeIndex: number;
  /** Progress along the edge in [0, 1]. */
  t: number;
  /** Speed in edge-lengths per second. */
  speed: number;
  tone: PulseTone;
  tailLength: number;
};

export type KnowledgeGraphState = {
  mode: "desktop" | "mobile";
  nodes: GraphNode[];
  edges: GraphEdge[];
  pulses: KnowledgePulse[];
  time: number;
};

const DEFAULT_SEED = 42019;
const MAX_STEP_DT = 0.05;
const PARALLAX_RANGE = 0.26;

/** Mulberry32 deterministic PRNG in [0, 1). */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function evaluateCubicBezier(
  p0: Point2D,
  cp1: Point2D,
  cp2: Point2D,
  p3: Point2D,
  t: number,
): Point2D {
  const clamped = Math.max(0, Math.min(1, t));
  const inv = 1 - clamped;
  const inv2 = inv * inv;
  const inv3 = inv2 * inv;
  const t2 = clamped * clamped;
  const t3 = t2 * clamped;
  return {
    x: inv3 * p0.x + 3 * inv2 * clamped * cp1.x + 3 * inv * t2 * cp2.x + t3 * p3.x,
    y: inv3 * p0.y + 3 * inv2 * clamped * cp1.y + 3 * inv * t2 * cp2.y + t3 * p3.y,
  };
}

export function getEdgeControlPoints(
  from: Point2D,
  to: Point2D,
  curveOffset: number,
): { cp1: Point2D; cp2: Point2D } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = len * curveOffset;

  return {
    cp1: {
      x: from.x + dx * 0.33 + nx * bend,
      y: from.y + dy * 0.33 + ny * bend,
    },
    cp2: {
      x: from.x + dx * 0.67 - nx * bend * 0.45,
      y: from.y + dy * 0.67 - ny * bend * 0.45,
    },
  };
}

export function projectNodePosition(
  node: GraphNode,
  width: number,
  height: number,
  scrollProgress: number,
  time: number,
  reducedMotion: boolean,
): Point2D {
  const driftX = reducedMotion ? 0 : Math.sin(time * 0.45 + node.phase) * 5 * node.depth;
  const driftY = reducedMotion ? 0 : Math.cos(time * 0.35 + node.phase * 1.3) * 4 * node.depth;
  const parallaxY = scrollProgress * PARALLAX_RANGE * node.depth;
  return {
    x: node.x * width + driftX,
    y: (node.y - parallaxY) * height + driftY,
  };
}

/** Boosts milestone completion as the visitor scrolls past the node's band. */
export function computeMilestoneMastery(node: GraphNode, scrollProgress: number): number {
  const threshold = Math.max(0, Math.min(1, (node.y - 0.12) / 1.1));
  const progressDelta = Math.max(0, Math.min(1, (scrollProgress - threshold + 0.38) / 0.55));
  return Math.min(1, node.baseMastery + progressDelta * (1 - node.baseMastery) * 0.85);
}

type TrackSpec = {
  baseX: number;
  sway: number;
  count: number;
  depth: number;
  milestoneIndices: number[];
};

const DESKTOP_TRACKS: TrackSpec[] = [
  { baseX: 0.085, sway: 0.035, count: 7, depth: 0.92, milestoneIndices: [1, 4, 6] },
  { baseX: 0.275, sway: 0.04, count: 6, depth: 0.64, milestoneIndices: [2, 5] },
  { baseX: 0.725, sway: 0.04, count: 6, depth: 0.68, milestoneIndices: [1, 4] },
  { baseX: 0.915, sway: 0.035, count: 7, depth: 0.95, milestoneIndices: [2, 5] },
];

const MOBILE_TRACKS: TrackSpec[] = [
  { baseX: 0.11, sway: 0.045, count: 5, depth: 0.86, milestoneIndices: [1, 3] },
  { baseX: 0.89, sway: 0.045, count: 5, depth: 0.9, milestoneIndices: [2, 4] },
];

const DESKTOP_TUTOR_HUBS = [
  { x: 0.45, y: 0.21, depth: 0.55 },
  { x: 0.56, y: 0.63, depth: 0.6 },
  { x: 0.48, y: 1.04, depth: 0.58 },
];

const MOBILE_TUTOR_HUBS = [
  { x: 0.48, y: 0.34, depth: 0.55 },
  { x: 0.52, y: 0.88, depth: 0.55 },
];

export function createKnowledgeGraph(
  mode: "desktop" | "mobile",
  seed = DEFAULT_SEED,
): KnowledgeGraphState {
  const rand = createSeededRandom(seed);
  const tracks = mode === "desktop" ? DESKTOP_TRACKS : MOBILE_TRACKS;
  const tutorSpecs = mode === "desktop" ? DESKTOP_TUTOR_HUBS : MOBILE_TUTOR_HUBS;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const trackNodeIds: number[][] = [];

  tracks.forEach((track, trackIndex) => {
    const ids: number[] = [];
    for (let i = 0; i < track.count; i++) {
      const id = nodes.length;
      const frac = track.count > 1 ? i / (track.count - 1) : 0.5;
      const wave = Math.sin(frac * Math.PI * 1.85 + trackIndex * 1.4) * track.sway;
      const jitterX = (rand() - 0.5) * 0.022;
      const jitterY = (rand() - 0.5) * 0.035;
      const isMilestone = track.milestoneIndices.includes(i);
      nodes.push({
        id,
        track: trackIndex,
        role: isMilestone ? "milestone" : "lesson",
        x: Math.max(0.03, Math.min(0.97, track.baseX + wave + jitterX)),
        y: Math.max(0.04, Math.min(1.28, 0.05 + frac * 1.2 + jitterY)),
        depth: track.depth + (rand() - 0.5) * 0.1,
        radius: isMilestone ? 6.5 + rand() * 1.8 : 2.8 + rand() * 1.2,
        baseMastery: isMilestone ? 0.32 + rand() * 0.38 : 0,
        phase: rand() * Math.PI * 2,
        glow: isMilestone ? 0.45 : 0.15,
        ripple: 0,
      });
      ids.push(id);

      if (i > 0) {
        edges.push({
          id: edges.length,
          from: ids[i - 1],
          to: id,
          kind: "track",
          curveOffset: (rand() - 0.5) * 0.24,
        });
      }
    }
    trackNodeIds.push(ids);
  });

  // Connect prerequisite/elective bridges across neighboring tracks.
  for (let t = 0; t < trackNodeIds.length - 1; t++) {
    const left = trackNodeIds[t];
    const right = trackNodeIds[t + 1];
    const pairs = mode === "desktop" ? [1, 3, 4] : [1, 3];
    for (const idx of pairs) {
      const fromId = left[Math.min(idx, left.length - 1)];
      const toId = right[Math.min(idx + (t % 2 === 0 ? 0 : -1), right.length - 1)];
      if (fromId !== undefined && toId !== undefined) {
        edges.push({
          id: edges.length,
          from: fromId,
          to: toId,
          kind: "bridge",
          curveOffset: (t % 2 === 0 ? 1 : -1) * (0.14 + rand() * 0.08),
        });
      }
    }
  }

  // Add AI Tutor concept hubs and link each to its 3 closest non-tutor nodes.
  for (const spec of tutorSpecs) {
    const hubId = nodes.length;
    nodes.push({
      id: hubId,
      track: -1,
      role: "tutor",
      x: spec.x + (rand() - 0.5) * 0.03,
      y: spec.y + (rand() - 0.5) * 0.03,
      depth: spec.depth,
      radius: 6.2,
      baseMastery: 0,
      phase: rand() * Math.PI * 2,
      glow: 0.55,
      ripple: 0,
    });

    const nearest = nodes
      .filter((n) => n.role !== "tutor")
      .map((n) => ({
        id: n.id,
        dist: Math.hypot(n.x - spec.x, n.y - spec.y),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, mode === "desktop" ? 3 : 2);

    for (const target of nearest) {
      edges.push({
        id: edges.length,
        from: hubId,
        to: target.id,
        kind: "tutor",
        curveOffset: (rand() > 0.5 ? 1 : -1) * (0.16 + rand() * 0.08),
      });
    }
  }

  const pulseCount = mode === "desktop" ? 13 : 6;
  const pulses: KnowledgePulse[] = [];
  for (let i = 0; i < pulseCount; i++) {
    const edgeIndex = Math.floor(rand() * edges.length);
    const edge = edges[edgeIndex];
    const tone: PulseTone =
      edge.kind === "tutor" ? "iris" : i % 5 === 0 ? "success" : "ember";
    pulses.push({
      id: i,
      edgeIndex,
      t: rand(),
      speed: edge.kind === "tutor" ? 0.16 + rand() * 0.08 : 0.13 + rand() * 0.1,
      tone,
      tailLength: edge.kind === "tutor" ? 0.24 : 0.2,
    });
  }

  return {
    mode,
    nodes,
    edges,
    pulses,
    time: 0,
  };
}

export function stepKnowledgeGraph(state: KnowledgeGraphState, rawDt: number): void {
  const dt = Math.max(0, Math.min(MAX_STEP_DT, rawDt));
  state.time += dt;

  for (const node of state.nodes) {
    const restingGlow = node.role === "tutor" ? 0.35 : node.role === "milestone" ? 0.22 : 0.08;
    if (node.glow > restingGlow) {
      node.glow = Math.max(restingGlow, node.glow - dt * 0.55);
    }
    if (node.ripple > 0) {
      node.ripple += dt * 0.72;
      if (node.ripple >= 1) {
        node.ripple = 0;
      }
    }
  }

  const edgeCount = state.edges.length;
  if (edgeCount === 0) return;

  for (const pulse of state.pulses) {
    pulse.t += pulse.speed * dt;
    if (pulse.t < 1) continue;

    const currentEdge = state.edges[pulse.edgeIndex];
    const dest = state.nodes[currentEdge.to];
    if (dest) {
      dest.glow = 1;
      if (dest.role === "milestone" || dest.role === "tutor") {
        dest.ripple = 0.01;
      }
    }

    // Prefer continuing along an outgoing edge from the arrived node; wrap deterministically otherwise.
    const outgoing: number[] = [];
    for (let i = 0; i < edgeCount; i++) {
      if (state.edges[i].from === currentEdge.to) {
        outgoing.push(i);
      }
    }

    if (outgoing.length > 0) {
      const pick = Math.floor((pulse.id + Math.floor(state.time * 3)) % outgoing.length);
      pulse.edgeIndex = outgoing[pick];
    } else {
      pulse.edgeIndex = (pulse.edgeIndex + 3 + pulse.id) % edgeCount;
    }

    const nextEdge = state.edges[pulse.edgeIndex];
    pulse.tone =
      nextEdge.kind === "tutor"
        ? "iris"
        : state.nodes[nextEdge.to]?.role === "milestone"
          ? "success"
          : "ember";
    pulse.t = pulse.t - 1;
  }
}
