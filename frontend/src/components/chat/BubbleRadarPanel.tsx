import { useMemo, useState } from "react";
import type { Metrics, PodId, Profile, ProfilePage, VisualMetric } from "../../types/profile";
import { POD_CONFIG } from "../../types/profile";

const MIN_RADAR_POINTS = 3;

const RADAR_CONFIG: Record<PodId, { title: string; color: string }> = {
  training: { title: "Training signals", color: "#ea580c" },
  fuel: { title: "Fuel signals", color: "#16a34a" },
  recovery: { title: "Recovery signals", color: "#2563eb" },
  story: { title: "Your Story signals", color: "#7e22ce" },
};

interface RadarPoint {
  label: string;
  score: number;
}

interface BubbleRadarPanelProps {
  profile: Profile | null;
  metrics: Metrics | null;
}

function clampScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseMetricNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null || value === "") return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function readableLabel(label: string | undefined): string {
  return (label || "Metric")
    .replace(/_/g, " ")
    .replace(/\b(avg|average|score|pct|percent|percentage)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

function normalizeMetric(metric: VisualMetric): number | null {
  const raw = parseMetricNumber(metric.value);
  if (raw == null) return null;

  const label = String(metric.label || metric.id || "").toLowerCase();
  const unit = String(metric.unit || "").toLowerCase();
  if (metric.min != null && metric.max != null && Number(metric.max) > Number(metric.min)) {
    return clampScore(((raw - Number(metric.min)) / (Number(metric.max) - Number(metric.min))) * 100);
  }
  if (metric.score != null) return clampScore(metric.score);
  if (metric.normalized != null) return clampScore(metric.normalized);
  if (unit.includes("%") || label.includes("score") || label.includes("readiness") || label.includes("confidence")) {
    return clampScore(raw);
  }
  if (label.includes("trend")) return clampScore(50 + raw);
  if (label.includes("hrv")) return clampScore((raw / 80) * 100);
  if (label.includes("resting") && (label.includes("hr") || label.includes("heart"))) {
    return clampScore(100 - Math.max(0, raw - 45) * 2);
  }
  if (label.includes("spo2") || label.includes("oxygen")) return clampScore((raw - 90) * 10);
  if (label.includes("sleep") && (unit.includes("hr") || unit.includes("hour"))) return clampScore((raw / 9) * 100);
  if (label.includes("deep") || label.includes("rem")) return clampScore(raw);
  if (label.includes("load")) return clampScore((raw / 700) * 100);
  if (raw <= 1) return clampScore(raw * 100);
  if (raw <= 100) return clampScore(raw);
  return clampScore(Math.min(100, Math.log10(raw) * 25));
}

function metricPoint(label: string, value: unknown, unit = ""): RadarPoint | null {
  const metricValue = typeof value === "number" || typeof value === "string" ? value : undefined;
  const score = normalizeMetric({ label, value: metricValue, unit });
  return score == null ? null : { label: readableLabel(label), score };
}

function metricFallbackPoints(podId: PodId, metrics: Metrics | null): RadarPoint[] {
  if (!metrics) return [];
  const add = (points: RadarPoint[], point: RadarPoint | null) => {
    if (point) points.push(point);
  };
  const points: RadarPoint[] = [];

  if (podId === "training") {
    add(points, metricPoint("HRV", metrics.hrv?.latest_ms ?? metrics.hrv?.avg_ms, "ms"));
    add(points, metricPoint("Resting HR", metrics.resting_hr?.latest_bpm ?? metrics.resting_hr?.avg_bpm, "bpm"));
    add(points, metricPoint("Steps", metrics.steps?.avg_daily, "steps"));
    add(points, metricPoint("VO2 Max", metrics.vo2_max?.latest, "mL/kg/min"));
  } else if (podId === "fuel") {
    add(points, metricPoint("Active calories", metrics.active_calories?.avg_daily_kcal, "kcal"));
    add(points, metricPoint("Steps", metrics.steps?.avg_daily, "steps"));
    add(points, metricPoint("Sleep", metrics.sleep?.avg_hours, "hrs"));
  } else if (podId === "recovery") {
    add(points, metricPoint("Sleep", metrics.sleep?.avg_hours, "hrs"));
    add(points, metricPoint("HRV", metrics.hrv?.latest_ms ?? metrics.hrv?.avg_ms, "ms"));
    add(points, metricPoint("Resting HR", metrics.resting_hr?.latest_bpm ?? metrics.resting_hr?.avg_bpm, "bpm"));
    add(points, metricPoint("SpO2", metrics.spo2?.latest_pct, "%"));
  }

  return points;
}

function pointsForPod(podId: PodId, profile: Profile | null, metrics: Metrics | null): RadarPoint[] {
  if (!profile) return [];
  if (podId === "story" && profile.archetype?.scores) {
    return Object.entries(profile.archetype.scores)
      .slice(0, 8)
      .map(([label, value]) => ({ label: readableLabel(label), score: clampScore(value) }))
      .filter((point): point is RadarPoint => point.score != null);
  }

  const page = profile[POD_CONFIG[podId].pageKey] as ProfilePage | undefined;
  const visualPoints = (page?.visual_metrics || [])
    .map((metric: VisualMetric) => {
      const score = normalizeMetric(metric);
      if (score == null) return null;
      return { label: readableLabel(metric.label || metric.id), score };
    })
    .filter((point: RadarPoint | null): point is RadarPoint => Boolean(point))
    .slice(0, 6);

  if (visualPoints.length >= MIN_RADAR_POINTS) return visualPoints;
  const fallback = metricFallbackPoints(podId, metrics);
  return fallback.length >= MIN_RADAR_POINTS ? fallback : [];
}

function firstSentence(text?: string): string {
  const plain = String(text || "").replace(/\s+/g, " ").trim();
  if (!plain) return "";
  return (plain.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [plain])[0].trim();
}

function summaryForPod(podId: PodId, profile: Profile | null, points: RadarPoint[]): string {
  const page = profile?.[POD_CONFIG[podId].pageKey] as ProfilePage | undefined;
  const context =
    firstSentence(page?.hero_summary) ||
    firstSentence(page?.plain_explanation?.body) ||
    firstSentence(page?.bubble_teaser) ||
    firstSentence(page?.bullet_summary?.[0]);
  const sorted = [...points].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const watch = sorted[sorted.length - 1];
  const result = `${strongest.label} is the strongest chart signal (${strongest.score}/100), while ${watch.label} is the main watch area (${watch.score}/100).`;
  return context ? `${context} ${result}` : result;
}

function polygonPoints(points: RadarPoint[], radius: number, center: number): string {
  return points
    .map((point, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / points.length;
      const r = (point.score / 100) * radius;
      return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
    })
    .join(" ");
}

export function hasBubbleRadarData(profile: Profile | null, metrics: Metrics | null): boolean {
  return (Object.keys(RADAR_CONFIG) as PodId[]).some(
    (podId) => pointsForPod(podId, profile, metrics).length >= MIN_RADAR_POINTS,
  );
}

export function BubbleRadarPanel({ profile, metrics }: BubbleRadarPanelProps) {
  const eligible = useMemo(
    () =>
      (Object.keys(RADAR_CONFIG) as PodId[]).filter(
        (podId) => pointsForPod(podId, profile, metrics).length >= MIN_RADAR_POINTS,
      ),
    [profile, metrics],
  );
  const [active, setActive] = useState<PodId>("training");
  const activePod = eligible.includes(active) ? active : eligible[0];
  const points = activePod ? pointsForPod(activePod, profile, metrics) : [];

  if (!activePod || points.length < MIN_RADAR_POINTS) return null;

  const center = 120;
  const radius = 74;
  const avg = Math.round(points.reduce((sum, point) => sum + point.score, 0) / points.length);
  const color = RADAR_CONFIG[activePod].color;
  const rings = [25, 50, 75, 100];

  return (
    <aside className="rounded-[28px] border border-slate-100 bg-white/85 p-4 shadow-sm backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Bubble chart</p>
          <h2 className="mt-1 text-base font-bold text-slate-800">{RADAR_CONFIG[activePod].title}</h2>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{avg}/100</span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {(Object.keys(RADAR_CONFIG) as PodId[]).map((podId) => {
          const disabled = !eligible.includes(podId);
          return (
            <button
              key={podId}
              type="button"
              disabled={disabled}
              onClick={() => setActive(podId)}
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                activePod === podId
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-slate-800"
              } ${disabled ? "cursor-not-allowed opacity-35 hover:border-slate-200 hover:text-slate-500" : ""}`}
              title={disabled ? "Add more relevant data for this bubble to generate a chart." : undefined}
            >
              {POD_CONFIG[podId].label.replace("Rest + ", "")}
            </button>
          );
        })}
      </div>

      <svg className="mt-3 h-56 w-full" viewBox="0 0 240 240" role="img" aria-label={`${RADAR_CONFIG[activePod].title} radar`}>
        {rings.map((ring) => {
          const r = (ring / 100) * radius;
          return <circle key={ring} cx={center} cy={center} r={r} fill="none" stroke="#E2E8F0" strokeWidth="1" />;
        })}
        {points.map((point, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / points.length;
          const labelR = radius + 24;
          const axisX = center + Math.cos(angle) * radius;
          const axisY = center + Math.sin(angle) * radius;
          const labelX = center + Math.cos(angle) * labelR;
          const labelY = center + Math.sin(angle) * labelR;
          return (
            <g key={`${point.label}-${index}`}>
              <line x1={center} y1={center} x2={axisX} y2={axisY} stroke="#E2E8F0" strokeWidth="1" />
              <text
                x={labelX}
                y={labelY}
                textAnchor={labelX < center - 8 ? "end" : labelX > center + 8 ? "start" : "middle"}
                dominantBaseline="middle"
                className="fill-slate-500 text-[9px] font-semibold"
              >
                {point.label}
              </text>
            </g>
          );
        })}
        <polygon points={polygonPoints(points, radius, center)} fill={color} opacity="0.16" stroke={color} strokeWidth="3" />
        {points.map((point, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / points.length;
          const r = (point.score / 100) * radius;
          return <circle key={`${point.label}-dot`} cx={center + Math.cos(angle) * r} cy={center + Math.sin(angle) * r} r="4" fill={color} />;
        })}
      </svg>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">{summaryForPod(activePod, profile, points)}</p>
    </aside>
  );
}
