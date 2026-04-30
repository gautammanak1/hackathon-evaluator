"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RRadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  architecture: "Architecture",
  protocols: "Protocols",
  ai_usage: "AI usage",
  code_quality: "Code quality",
  innovation: "Innovation",
};

type Props = {
  scores: Record<string, number>;
  className?: string;
};

export function ScoreRadar({ scores, className }: Props) {
  const data = Object.entries(scores).map(([k, v]) => ({
    axis: LABELS[k] || k.replace(/_/g, " "),
    score: Math.min(10, Math.max(0, Number(v) || 0)),
    full: 10,
  }));

  if (data.length === 0) return null;

  return (
    <div className={cn("h-[280px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RRadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#30363d" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#8b949e", fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: "#6e7681", fontSize: 10 }} />
          <Radar name="Score" dataKey="score" stroke="#238636" fill="#238636" fillOpacity={0.35} animationDuration={600} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 8,
              color: "#e6edf3",
              fontSize: 12,
            }}
            formatter={(value: number) => [`${value} / 10`, "Score"]}
          />
        </RRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
