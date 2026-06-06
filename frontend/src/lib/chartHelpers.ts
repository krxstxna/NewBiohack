import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadialLinearScale,
  Filler,
  Legend,
  Tooltip,
  DoughnutController,
  ArcElement,
  RadarController,
} from "chart.js";
import type { Metrics, PodId, Profile, VisualMetric } from "../types/profile";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadialLinearScale,
  Filler,
  Legend,
  Tooltip,
  DoughnutController,
  ArcElement,
  RadarController,
);

const CHART_TICK = { color: "#64748B", font: { size: 10 } };
const CHART_GRID = "rgba(148, 163, 184, 0.25)";

function chartLabels(series: { date: string; value: number }[]) {
  return (series || []).map((p) => {
    const d = String(p.date || "");
    return d.length >= 10 ? d.slice(5) : d;
  });
}

function chartValues(series: { date: string; value: number }[]) {
  return (series || []).map((p) => Number(p.value));
}

function hasSeriesData(series?: { date: string; value: number }[]) {
  return Array.isArray(series) && series.length > 0;
}

function chartScales(xStacked = false, yStacked = false, yTitle = "") {
  return {
    x: {
      stacked: xStacked,
      grid: { display: false, color: CHART_GRID },
      ticks: { maxTicksLimit: 8, ...CHART_TICK },
    },
    y: {
      stacked: yStacked,
      beginAtZero: !yStacked,
      grid: { color: CHART_GRID },
      ticks: CHART_TICK,
      title: yTitle ? { display: true, text: yTitle, color: "#64748B", font: { size: 10 } } : undefined,
    },
  };
}

function metricValue(visualMetrics: VisualMetric[] | undefined, key: string) {
  if (!Array.isArray(visualMetrics)) return null;
  const row = visualMetrics.find((m) => {
    const label = String(m.label || "").toLowerCase();
    return label.includes(key) || String(m.id || "").toLowerCase() === key;
  });
  return row?.value ?? null;
}

export interface ChartSpec {
  title: string;
  build: (canvas: HTMLCanvasElement) => Chart | null;
}

export function buildDetailChartSpecs(podId: PodId, metrics: Metrics | null, profile: Profile | null): ChartSpec[] {
  const charts = metrics?.charts || {};
  const pageKey = ({ training: "train", fuel: "fuel", recovery: "rest_recovery", story: "your_story" } as const)[podId];
  const page = profile?.[pageKey] as { visual_metrics?: VisualMetric[] } | undefined;
  const visual = page?.visual_metrics;
  const specs: ChartSpec[] = [];

  const addLine = (title: string, series: { date: string; value: number }[] | undefined, label: string, color: string) => {
    if (!hasSeriesData(series)) return;
    specs.push({
      title,
      build: (canvas) =>
        new Chart(canvas, {
          type: "line",
          data: {
            labels: chartLabels(series!),
            datasets: [{ label, data: chartValues(series!), borderColor: color, backgroundColor: color.replace("0.9", "0.12").replace("0.85", "0.12").replace("0.8", "0.12"), fill: true, tension: 0.35, pointRadius: 2 }],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: chartScales() },
        }),
    });
  };

  const addBar = (title: string, series: { date: string; value: number }[] | undefined, label: string, color: string) => {
    if (!hasSeriesData(series)) return;
    specs.push({
      title,
      build: (canvas) =>
        new Chart(canvas, {
          type: "bar",
          data: { labels: chartLabels(series!), datasets: [{ label, data: chartValues(series!), backgroundColor: color, borderRadius: 6 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: chartScales() },
        }),
    });
  };

  if (podId === "training") {
    addLine("HRV trend", charts.hrv, "HRV (ms)", "rgba(37, 99, 235, 0.9)");
    addLine("Resting heart rate", charts.resting_hr, "bpm", "rgba(220, 38, 38, 0.85)");
    addBar("Daily steps", charts.steps, "Steps", "rgba(234, 88, 12, 0.8)");
    const readiness = metricValue(visual, "readiness");
    if (readiness != null) {
      specs.push({
        title: "Readiness",
        build: (canvas) => gaugeChart(canvas, "Readiness", readiness, "rgba(37, 99, 235, 0.85)"),
      });
    }
  } else if (podId === "fuel") {
    addBar("Active calories", charts.active_calories, "kcal", "rgba(22, 163, 74, 0.8)");
    addBar("Daily steps", charts.steps, "Steps", "rgba(234, 88, 12, 0.75)");
    const sleep = metrics?.sleep;
    if (sleep?.avg_deep_min != null || sleep?.avg_rem_min != null) {
      specs.push({
        title: "Sleep stage mix (avg)",
        build: (canvas) =>
          new Chart(canvas, {
            type: "doughnut",
            data: {
              labels: ["Deep", "REM", "Other"],
              datasets: [{
                data: [
                  Number(sleep.avg_deep_min || 0),
                  Number(sleep.avg_rem_min || 0),
                  Math.max(0, Number(sleep.avg_hours || 0) * 60 - Number(sleep.avg_deep_min || 0) - Number(sleep.avg_rem_min || 0)),
                ],
                backgroundColor: ["rgba(29, 78, 216, 0.85)", "rgba(124, 58, 237, 0.85)", "rgba(148, 163, 184, 0.6)"],
                borderWidth: 0,
              }],
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { boxWidth: 10, color: "#64748B", font: { size: 10 } } } } },
          }),
      });
    }
  } else if (podId === "recovery") {
    if (hasSeriesData(charts.sleep_deep_min) || hasSeriesData(charts.sleep_rem_min)) {
      specs.push({ title: "Sleep stages", build: (canvas) => stackedSleepChart(canvas, charts) });
    }
    addLine("HRV trend", charts.hrv, "HRV (ms)", "rgba(37, 99, 235, 0.9)");
    addLine("Blood oxygen (SpO2)", charts.spo2, "%", "rgba(13, 148, 136, 0.85)");
    addLine("Sleep duration", charts.sleep_hours, "Hours", "rgba(79, 70, 229, 0.85)");
    const recovery = metricValue(visual, "recovery");
    const sleepScore = metricValue(visual, "sleep");
    if (recovery != null) specs.push({ title: "Recovery score", build: (c) => gaugeChart(c, "Recovery", recovery, "rgba(13, 148, 136, 0.85)") });
    if (sleepScore != null) specs.push({ title: "Sleep score", build: (c) => gaugeChart(c, "Sleep", sleepScore, "rgba(79, 70, 229, 0.85)") });
  } else if (podId === "story") {
    const scores = profile?.archetype?.scores;
    if (scores) {
      specs.push({ title: "Archetype VQ scores", build: (canvas) => archetypeBarChart(canvas, scores) });
    }
    addLine("HRV trend", charts.hrv, "HRV (ms)", "rgba(37, 99, 235, 0.9)");
    addLine("Resting heart rate", charts.resting_hr, "bpm", "rgba(220, 38, 38, 0.85)");
  }

  return specs;
}

function gaugeChart(canvas: HTMLCanvasElement, label: string, value: string | number, color: string, max = 100) {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return new Chart(canvas, {
    type: "doughnut",
    data: { labels: [label, "Remaining"], datasets: [{ data: [num, Math.max(0, max - num)], backgroundColor: [color, "rgba(148,163,184,0.15)"], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { display: false } } },
  });
}

function archetypeBarChart(canvas: HTMLCanvasElement, scores: Record<string, number>) {
  const order = ["forge", "drift", "volt", "titan", "blitz", "pulse", "surge", "prime"];
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: order.map((id) => id.charAt(0).toUpperCase() + id.slice(1)),
      datasets: [{ label: "VQ score", data: order.map((id) => Number(scores[id] ?? 0)), backgroundColor: "rgba(234, 88, 12, 0.75)", borderRadius: 6 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { ...chartScales(), y: { ...chartScales().y, max: 100, beginAtZero: true } } },
  });
}

function stackedSleepChart(canvas: HTMLCanvasElement, charts: Record<string, { date: string; value: number }[]>) {
  const deep = charts.sleep_deep_min || [];
  const rem = charts.sleep_rem_min || [];
  const light = charts.sleep_light_min || [];
  const dates = [...new Set([...deep.map((p) => p.date), ...rem.map((p) => p.date), ...light.map((p) => p.date)])].sort();
  if (!dates.length) return null;
  const byDate = (series: { date: string; value: number }[]) => {
    const map = Object.fromEntries((series || []).map((p) => [p.date, p.value]));
    return dates.map((d) => map[d] ?? 0);
  };
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: dates.map((d) => d.slice(5)),
      datasets: [
        { label: "Deep", data: byDate(deep), backgroundColor: "rgba(29, 78, 216, 0.85)", stack: "sleep" },
        { label: "REM", data: byDate(rem), backgroundColor: "rgba(124, 58, 237, 0.85)", stack: "sleep" },
        { label: "Light", data: byDate(light), backgroundColor: "rgba(148, 163, 184, 0.75)", stack: "sleep" },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, color: "#64748B", font: { size: 10 } } } }, scales: chartScales(true, true, "min") },
  });
}

export function buildRadarChart(canvas: HTMLCanvasElement, labels: string[], values: number[], color: string, title: string) {
  return new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [{ label: title, data: values, backgroundColor: color.replace("0.9", "0.18"), borderColor: color, borderWidth: 2, pointBackgroundColor: "#F8FAFC", pointBorderColor: color, pointRadius: 3 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed.r}/100` } } },
      scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, angleLines: { color: "rgba(148,163,184,0.3)" }, grid: { color: "rgba(148,163,184,0.3)" }, pointLabels: { color: "#475569", font: { size: 10 } } } },
    },
  });
}
