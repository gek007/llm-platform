import { describe, expect, test } from "vitest";
import {
  computeMilestoneMastery,
  createKnowledgeGraph,
  createSeededRandom,
  evaluateCubicBezier,
  getEdgeControlPoints,
  projectNodePosition,
  stepKnowledgeGraph,
} from "./knowledge-graph-model";

describe("knowledge-graph-model", () => {
  test("seeded random produces repeatable values in [0, 1)", () => {
    const a = createSeededRandom(12345);
    const b = createSeededRandom(12345);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());

    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("creates deterministic graphs with all three LMS node roles and valid edges", () => {
    const first = createKnowledgeGraph("desktop", 99);
    const second = createKnowledgeGraph("desktop", 99);
    expect(first).toEqual(second);

    const roles = new Set(first.nodes.map((n) => n.role));
    expect(roles).toEqual(new Set(["lesson", "milestone", "tutor"]));

    const kinds = new Set(first.edges.map((e) => e.kind));
    expect(kinds).toEqual(new Set(["track", "bridge", "tutor"]));

    for (const edge of first.edges) {
      expect(edge.from).toBeGreaterThanOrEqual(0);
      expect(edge.from).toBeLessThan(first.nodes.length);
      expect(edge.to).toBeGreaterThanOrEqual(0);
      expect(edge.to).toBeLessThan(first.nodes.length);
      expect(edge.from).not.toBe(edge.to);
    }

    for (const pulse of first.pulses) {
      expect(pulse.edgeIndex).toBeGreaterThanOrEqual(0);
      expect(pulse.edgeIndex).toBeLessThan(first.edges.length);
      expect(pulse.t).toBeGreaterThanOrEqual(0);
      expect(pulse.t).toBeLessThan(1);
    }
  });

  test("mobile mode uses fewer nodes and pulses than desktop", () => {
    const desktop = createKnowledgeGraph("desktop");
    const mobile = createKnowledgeGraph("mobile");

    expect(mobile.nodes.length).toBeLessThan(desktop.nodes.length);
    expect(mobile.edges.length).toBeLessThan(desktop.edges.length);
    expect(mobile.pulses.length).toBeLessThan(desktop.pulses.length);
  });

  test("cubic Bezier starts at p0, ends at p3, and bends cleanly at midpoint", () => {
    const p0 = { x: 0, y: 0 };
    const p3 = { x: 100, y: 200 };
    const { cp1, cp2 } = getEdgeControlPoints(p0, p3, 0.2);

    expect(evaluateCubicBezier(p0, cp1, cp2, p3, 0)).toEqual(p0);
    expect(evaluateCubicBezier(p0, cp1, cp2, p3, 1)).toEqual(p3);

    const mid = evaluateCubicBezier(p0, cp1, cp2, p3, 0.5);
    expect(mid.x).toBeGreaterThan(-50);
    expect(mid.x).toBeLessThan(150);
    expect(mid.y).toBeGreaterThan(0);
    expect(mid.y).toBeLessThan(200);
  });

  test("projectNodePosition shifts upward with scroll and omits drift under reduced motion", () => {
    const graph = createKnowledgeGraph("desktop");
    const node = graph.nodes[0];

    const topReduced = projectNodePosition(node, 1200, 800, 0, 5, true);
    const scrolledReduced = projectNodePosition(node, 1200, 800, 1, 5, true);
    const laterReduced = projectNodePosition(node, 1200, 800, 0, 99, true);

    expect(scrolledReduced.y).toBeLessThan(topReduced.y);
    expect(laterReduced).toEqual(topReduced);

    const animatedLater = projectNodePosition(node, 1200, 800, 0, 2.5, false);
    expect(animatedLater).not.toEqual(topReduced);
  });

  test("computeMilestoneMastery increases with scroll progress and stays bounded in [0, 1]", () => {
    const graph = createKnowledgeGraph("desktop");
    const milestone = graph.nodes.find((n) => n.role === "milestone");
    expect(milestone).toBeDefined();
    if (!milestone) return;

    const atTop = computeMilestoneMastery(milestone, 0);
    const atBottom = computeMilestoneMastery(milestone, 1);

    expect(atTop).toBeGreaterThanOrEqual(milestone.baseMastery);
    expect(atBottom).toBeGreaterThanOrEqual(atTop);
    expect(atBottom).toBeLessThanOrEqual(1);
  });

  test("stepKnowledgeGraph advances pulses, illuminates destination nodes, and decays glow", () => {
    const graph = createKnowledgeGraph("desktop");
    const targetPulse = graph.pulses[0];
    const destId = graph.edges[targetPulse.edgeIndex].to;
    const destNode = graph.nodes[destId];

    // Place the pulse right before arrival so a single step crosses t = 1.
    targetPulse.t = 0.995;
    targetPulse.speed = 0.5;
    destNode.glow = 0.1;

    stepKnowledgeGraph(graph, 0.04);

    expect(destNode.glow).toBe(1);
    expect(targetPulse.t).toBeGreaterThanOrEqual(0);
    expect(targetPulse.t).toBeLessThan(1);

    // Subsequent steps decay glow back down toward resting level.
    const afterArrivalGlow = destNode.glow;
    stepKnowledgeGraph(graph, 0.05);
    expect(destNode.glow).toBeLessThan(afterArrivalGlow);
  });
});
