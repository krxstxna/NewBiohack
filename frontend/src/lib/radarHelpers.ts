import type { Metrics, Profile, RadarSectionId, VisualMetric } from "../types/profile";
import { RADAR_SECTIONS } from "../types/profile";

export const MIN_RADAR_POINTS = 3;

export interface RadarPoint {
  label: string;
  score: number;
}

function clampScore(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseMetricNumber(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function readableRadarLabel(label: string) {
  return String(label || "Metric")
    .replace(/_/g, " ")
    .replace(/\b(avg|average|score|pct|percent|percentage)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

function normalizeProfileMetric(metric: VisualMetric) {
  const label = String(metric.label || metric.id || "").toLowerCase();
  const unit = String(metric.unit || "").toLowerCase();
  const raw = parseMetricNumber(metric.value);
  if (raw == null) return null;

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

export function profileRadarPoints(sectionId: RadarSectionId, profile: Profile | null): RadarPoint[] {
  if (!profile) return [];

  if (sectionId === "story" && profile.archetype?.scores) {
    return Object.entries(profile.archetype.scores)
      .slice(0, 8)
      .map(([label, value]) => ({ label: readableRadarLabel(label), score: clampScore(value) ?? 0 }))
      .filter((p) => p.score != null);
  }

  const cfg = RADAR_SECTIONS[sectionId];
  const visualMetrics = (profile[cfg.pageKey] as { visual_metrics?: VisualMetric[] })?.visual_metrics || [];
  return visualMetrics
    .map((metric) => {
      const score = normalizeProfileMetric(metric);
      if (score == null) return null;
      return { label: readableRadarLabel(metric.label || metric.id || ""), score };
    })
    .filter((p): p is RadarPoint => p != null)
    .slice(0, 6);
}

export function radarEligibleSections(profile: Profile | null): RadarSectionId[] {
  return (Object.keys(RADAR_SECTIONS) as RadarSectionId[]).filter(
    (id) => profileRadarPoints(id, profile).length >= MIN_RADAR_POINTS,
  );
}

function firstSentences(text: string, max = 1) {
  const plain = String(text || "").replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const sentences = plain.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [plain];
  return sentences.slice(0, max).join(" ").trim();
}

export function chartNarrative(sectionId: RadarSectionId, profile: Profile | null, points: RadarPoint[]) {
  const cfg = RADAR_SECTIONS[sectionId];
  const page = (profile?.[cfg.pageKey] || {}) as {
    hero_summary?: string;
    plain_explanation?: { body?: string };
    bubble_teaser?: string;
    bullet_summary?: string[];
  };
  const profileText =
    page.hero_summary ||
    page.plain_explanation?.body ||
    page.bubble_teaser ||
    page.bullet_summary?.[0] ||
    "";

  if (!points.length) return firstSentences(profileText, 1);

  const sorted = [...points].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const watch = sorted[sorted.length - 1];
  const result = `${strongest.label} is the strongest chart signal (${strongest.score}/100), while ${watch.label} is the main watch area (${watch.score}/100).`;
  const context = firstSentences(profileText, 1);
  return context ? `${context} ${result}` : result;
}

export function getGeneDotClass(phenotype = "") {
  const p = phenotype.toLowerCase();
  if (p.includes("poor") || p.includes("low") || p.includes("decreased") || p.includes("s/s")) return "bg-rose-500";
  if (p.includes("ultra") || p.includes("rapid")) return "bg-amber-500";
  if (p.includes("normal") || p.includes("extensive") || p.includes("wild")) return "bg-emerald-500";
  return "bg-amber-500";
}

export function formatMetricsRows(metrics: Metrics | null) {
  if (!metrics) return [];
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | number | undefined) => {
    if (value == null || value === "") return;
    rows.push({ label, value: String(value) });
  };

  add("HRV", metrics.hrv?.latest_ms ?? metrics.hrv?.avg_ms ? `${metrics.hrv.latest_ms ?? metrics.hrv.avg_ms} ms` : undefined);
  add("Resting HR", metrics.resting_hr?.latest_bpm ?? metrics.resting_hr?.avg_bpm ? `${metrics.resting_hr.latest_bpm ?? metrics.resting_hr.avg_bpm} bpm` : undefined);
  add("SpO2", metrics.spo2?.latest_pct ?? metrics.spo2?.avg_pct ? `${metrics.spo2.latest_pct ?? metrics.spo2.avg_pct}%` : undefined);
  add("Sleep", metrics.sleep?.avg_hours ? `${metrics.sleep.avg_hours} hrs/night` : undefined);
  add("Steps", metrics.steps?.avg_daily ? `${Math.round(metrics.steps.avg_daily).toLocaleString()}/day` : undefined);
  add("VO2 Max", metrics.vo2_max?.latest ? `${metrics.vo2_max.latest} mL/kg/min` : undefined);
  add("Active cal", metrics.active_calories?.avg_daily_kcal ? `${Math.round(metrics.active_calories.avg_daily_kcal)}/day` : undefined);

  return rows;
}
