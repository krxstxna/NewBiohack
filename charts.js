/* ── Junction / wearable charts for profile dashboard ─────────────── */

let dashboardChartInstances = [];

function destroyDashboardCharts() {
  dashboardChartInstances.forEach((chart) => chart.destroy());
  dashboardChartInstances = [];
}

function chartLabels(series) {
  return (series || []).map((p) => {
    const d = String(p.date || "");
    return d.length >= 10 ? d.slice(5) : d;
  });
}

function chartValues(series) {
  return (series || []).map((p) => Number(p.value));
}

function hasSeriesData(series) {
  return Array.isArray(series) && series.length > 0;
}

function createChartCard(container, title) {
  const card = document.createElement("div");
  card.className = "chart-card";
  const heading = document.createElement("h3");
  heading.className = "chart-title";
  heading.textContent = title;
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "chart-canvas-wrap";
  const canvas = document.createElement("canvas");
  canvasWrap.appendChild(canvas);
  card.append(heading, canvasWrap);
  container.appendChild(card);
  return canvas;
}

function registerChart(chart) {
  if (chart) dashboardChartInstances.push(chart);
  return chart;
}

const CHART_TICK = { color: "#8BA3C7", font: { size: 10 } };
const CHART_GRID = { color: "rgba(255, 255, 255, 0.08)" };

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
      title: yTitle ? { display: true, text: yTitle, color: "#8BA3C7", font: { size: 10 } } : undefined,
    },
  };
}

function chartLegend() {
  return { position: "bottom", labels: { boxWidth: 10, color: "#8BA3C7", font: { size: 10 } } };
}

function lineChart(canvas, series, label, color) {
  if (!window.Chart || !hasSeriesData(series)) return null;
  return registerChart(new Chart(canvas, {
    type: "line",
    data: {
      labels: chartLabels(series),
      datasets: [{
        label,
        data: chartValues(series),
        borderColor: color,
        backgroundColor: color.replace("1)", "0.12)"),
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: chartScales(),
    },
  }));
}

function barChart(canvas, series, label, color) {
  if (!window.Chart || !hasSeriesData(series)) return null;
  return registerChart(new Chart(canvas, {
    type: "bar",
    data: {
      labels: chartLabels(series),
      datasets: [{
        label,
        data: chartValues(series),
        backgroundColor: color,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: chartScales(false, false),
    },
  }));
}

function stackedSleepChart(canvas, charts) {
  const deep = charts.sleep_deep_min || [];
  const rem = charts.sleep_rem_min || [];
  const light = charts.sleep_light_min || [];
  const dates = [...new Set([
    ...deep.map((p) => p.date),
    ...rem.map((p) => p.date),
    ...light.map((p) => p.date),
  ])].sort();

  if (!dates.length || !window.Chart) return null;

  const byDate = (series) => {
    const map = Object.fromEntries((series || []).map((p) => [p.date, p.value]));
    return dates.map((d) => map[d] ?? 0);
  };

  return registerChart(new Chart(canvas, {
    type: "bar",
    data: {
      labels: dates.map((d) => d.slice(5)),
      datasets: [
        { label: "Deep", data: byDate(deep), backgroundColor: "rgba(29, 78, 216, 0.85)", stack: "sleep" },
        { label: "REM", data: byDate(rem), backgroundColor: "rgba(124, 58, 237, 0.85)", stack: "sleep" },
        { label: "Light", data: byDate(light), backgroundColor: "rgba(148, 163, 184, 0.75)", stack: "sleep" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: chartLegend() },
      scales: chartScales(true, true, "min"),
    },
  }));
}

function doughnutChart(canvas, labels, values, colors) {
  if (!window.Chart || !values.length) return null;
  return registerChart(new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: { legend: chartLegend() },
    },
  }));
}

function archetypeBarChart(canvas, scores) {
  if (!window.Chart || !scores || typeof scores !== "object") return null;
  const order = ["forge", "drift", "volt", "titan", "blitz", "pulse", "surge", "prime"];
  const labels = order.map((id) => id.charAt(0).toUpperCase() + id.slice(1));
  const values = order.map((id) => Number(scores[id] ?? 0));
  return registerChart(new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "VQ score",
        data: values,
        backgroundColor: "rgba(234, 88, 12, 0.75)",
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        ...chartScales(),
        y: { ...chartScales().y, max: 100, beginAtZero: true },
      },
    },
  }));
}

function gaugeFromMetric(canvas, label, value, max = 100, color = "rgba(37, 99, 235, 0.85)") {
  const num = Number(value);
  if (!window.Chart || Number.isNaN(num)) return null;
  const rest = Math.max(0, max - num);
  return registerChart(new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: [label, "Remaining"],
      datasets: [{ data: [num, rest], backgroundColor: [color, "rgba(0,0,0,0.06)"], borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${label}: ${ctx.parsed}` } },
      },
    },
  }));
}

function metricValue(visualMetrics, key) {
  if (!Array.isArray(visualMetrics)) return null;
  const row = visualMetrics.find((m) => {
    const label = String(m.label || "").toLowerCase();
    return label.includes(key) || String(m.id || "").toLowerCase() === key;
  });
  return row?.value ?? null;
}

function renderDashboardCharts(sectionId, metrics, profile) {
  const container = document.getElementById("detail-charts");
  if (!container) return;

  destroyDashboardCharts();
  container.innerHTML = "";

  const charts = metrics?.charts || {};
  const page = profile?.[({ training: "train", fuel: "fuel", recovery: "rest_recovery", story: "your_story" }[sectionId])] || {};
  const visual = page.visual_metrics;
  let rendered = 0;

  const addLine = (title, series, label, color) => {
    if (!hasSeriesData(series)) return;
    lineChart(createChartCard(container, title), series, label, color);
    rendered += 1;
  };

  const addBar = (title, series, label, color) => {
    if (!hasSeriesData(series)) return;
    barChart(createChartCard(container, title), series, label, color);
    rendered += 1;
  };

  if (sectionId === "training") {
    addLine("HRV trend", charts.hrv, "HRV (ms)", "rgba(37, 99, 235, 0.9)");
    addLine("Resting heart rate", charts.resting_hr, "bpm", "rgba(220, 38, 38, 0.85)");
    addBar("Daily steps", charts.steps, "Steps", "rgba(234, 88, 12, 0.8)");
    const readiness = metricValue(visual, "readiness");
    if (readiness != null) {
      gaugeFromMetric(createChartCard(container, "Readiness"), "Readiness", readiness, 100);
      rendered += 1;
    }
  } else if (sectionId === "fuel") {
    addBar("Active calories", charts.active_calories, "kcal", "rgba(22, 163, 74, 0.8)");
    addBar("Daily steps", charts.steps, "Steps", "rgba(234, 88, 12, 0.75)");
    const sleep = metrics?.sleep;
    if (sleep?.avg_deep_min != null || sleep?.avg_rem_min != null) {
      doughnutChart(
        createChartCard(container, "Sleep stage mix (avg)"),
        ["Deep", "REM", "Other"],
        [
          Number(sleep.avg_deep_min || 0),
          Number(sleep.avg_rem_min || 0),
          Math.max(0, Number(sleep.avg_hours || 0) * 60 - Number(sleep.avg_deep_min || 0) - Number(sleep.avg_rem_min || 0)),
        ],
        ["rgba(29, 78, 216, 0.85)", "rgba(124, 58, 237, 0.85)", "rgba(148, 163, 184, 0.6)"],
      );
      rendered += 1;
    }
  } else if (sectionId === "recovery") {
    if (hasSeriesData(charts.sleep_deep_min) || hasSeriesData(charts.sleep_rem_min)) {
      stackedSleepChart(createChartCard(container, "Sleep stages"), charts);
      rendered += 1;
    }
    addLine("HRV trend", charts.hrv, "HRV (ms)", "rgba(37, 99, 235, 0.9)");
    addLine("Blood oxygen (SpO2)", charts.spo2, "%", "rgba(13, 148, 136, 0.85)");
    addLine("Sleep duration", charts.sleep_hours, "Hours", "rgba(79, 70, 229, 0.85)");
    const recovery = metricValue(visual, "recovery");
    const sleepScore = metricValue(visual, "sleep");
    if (recovery != null) {
      gaugeFromMetric(createChartCard(container, "Recovery score"), "Recovery", recovery, 100, "rgba(13, 148, 136, 0.85)");
      rendered += 1;
    }
    if (sleepScore != null) {
      gaugeFromMetric(createChartCard(container, "Sleep score"), "Sleep", sleepScore, 100, "rgba(79, 70, 229, 0.85)");
      rendered += 1;
    }
  } else if (sectionId === "story") {
    const scores = profile?.archetype?.scores;
    if (scores) {
      archetypeBarChart(createChartCard(container, "Archetype VQ scores"), scores);
      rendered += 1;
    }
    addLine("HRV trend", charts.hrv, "HRV (ms)", "rgba(37, 99, 235, 0.9)");
    addLine("Resting heart rate", charts.resting_hr, "bpm", "rgba(220, 38, 38, 0.85)");
  }

  if (!rendered) {
    container.classList.add("hidden");
  } else {
    container.classList.remove("hidden");
  }
}
