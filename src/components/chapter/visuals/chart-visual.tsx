"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from "recharts";
import type { Visual } from "../../../../convex/lib/deck";

type Chart = Extract<Visual, { type: "chart" }>;

const SERIES = "var(--chart-1)";
const SLICES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
/** Direct value labels only while they cannot collide. */
const LABELLED_POINTS = 6;

const tooltip = {
  contentStyle: {
    background: "var(--color-surface-3)",
    border: "1px solid var(--color-line-strong)",
    borderRadius: 8,
    color: "var(--color-fg)",
  },
  itemStyle: { color: "var(--color-fg)" },
  labelStyle: { color: "var(--color-muted)" },
};

/**
 * The drawn chart (Recharts, loaded lazily by slide-visual.tsx). Marks take the chart palette;
 * every label, tick and legend entry takes a text token, so identity never rests on colour alone.
 * The same numbers are in a table for screen readers, next to this component.
 */
export default function ChartVisual({ chartType, data }: Pick<Chart, "chartType" | "data">) {
  const box = useRef<HTMLDivElement>(null);
  // Chart text is sized in px by Recharts; follow the slide's own font size so it scales with it.
  const [em, setEm] = useState(16);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setEm(parseFloat(getComputedStyle(el).fontSize) || 16));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fontSize = Math.max(9, Math.round(em * 0.78));
  const tick = { fill: "var(--color-muted)", fontSize };
  const axisLine = { stroke: "var(--color-line-strong)" };
  const direct = data.length <= LABELLED_POINTS;

  return (
    <div ref={box} dir="ltr" aria-hidden="true" className="absolute inset-0">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "pie" ? (
          <PieChart>
            <Pie
              data={data.map((d, i) => ({ ...d, fill: SLICES[i % SLICES.length] }))}
              dataKey="value"
              nameKey="label"
              innerRadius="42%"
              outerRadius="72%"
              paddingAngle={1}
              stroke="var(--color-surface)"
              strokeWidth={2}
              isAnimationActive={false}
              labelLine={{ stroke: "var(--color-line-strong)" }}
              label={(p: PieLabelRenderProps) => (
                <text x={p.x} y={p.y} textAnchor={p.textAnchor} dominantBaseline="central" fill="var(--color-fg)" fontSize={fontSize}>
                  {`${Math.round(Number(p.percent ?? 0) * 100)}%`}
                </text>
              )}
            />
            <Tooltip {...tooltip} />
            <Legend iconType="circle" formatter={(value) => <span style={{ color: "var(--color-fg)", fontSize }}>{value}</span>} />
          </PieChart>
        ) : chartType === "line" ? (
          <LineChart data={data} margin={{ top: fontSize * 2, right: fontSize, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={axisLine} interval="preserveStartEnd" />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={fontSize * 3.5} />
            <Tooltip {...tooltip} cursor={{ stroke: "var(--color-line-strong)" }} />
            <Line
              dataKey="value"
              stroke={SERIES}
              strokeWidth={2}
              dot={{ r: 4, fill: SERIES, stroke: "var(--color-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            >
              {direct ? <LabelList dataKey="value" position="top" fill="var(--color-fg)" fontSize={fontSize} /> : null}
            </Line>
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: fontSize * 2, right: fontSize, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={axisLine} interval={0} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={fontSize * 3.5} />
            <Tooltip {...tooltip} cursor={{ fill: "var(--color-surface-3)", opacity: 0.5 }} />
            <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
              {direct ? <LabelList dataKey="value" position="top" fill="var(--color-fg)" fontSize={fontSize} /> : null}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
