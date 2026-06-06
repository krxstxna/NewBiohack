/* ── Config ─────────────────────────────────────────────────────── */
function getApiBase() {
  const { protocol, hostname, port } = window.location;
  if (port === "8000") return `${protocol}//${hostname}:${port}/api`;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:8000/api`;
  }
  return `${window.location.origin}/api`;
}

const API = getApiBase();
const STORAGE_KEY = "genofit_onboarding";

/* ── State ──────────────────────────────────────────────────────── */
let isLoading = false;
let currentStep = 0;
let userName = "";
let cachedProfile = null;
let cachedMetrics = null;

const ARCHETYPE_IDS = ["forge", "drift", "volt", "titan", "blitz", "pulse", "surge", "prime"];

const DASHBOARD_SECTIONS = {
  training: {
    title: "Training",
    subtitle: "Personalized Training Recs",
    pageKey: "train",
    amaPrompt: "Tell me more about my training recommendations based on my genetics, labs, and wearables.",
  },
  fuel: {
    title: "Fuel",
    subtitle: "Personalized Nutrition Recs",
    pageKey: "fuel",
    amaPrompt: "Tell me more about my nutrition and fuel recommendations based on my data.",
  },
  recovery: {
    title: "Rest + Recovery",
    subtitle: "Personalized Recovery Recs",
    pageKey: "rest_recovery",
    amaPrompt: "Tell me more about my recovery and sleep recommendations.",
  },
  story: {
    title: "Your Story",
    subtitle: "Archetype & cross-domain correlations",
    pageKey: "your_story",
    amaPrompt: "Explain my archetype and how my genes connect to my wearable and lab data.",
  },
};

function getPrimaryArchetype(profile) {
  if (!profile) return {};
  return profile.archetype?.primary || profile.archetype_primary || {};
}

function getSecondaryArchetypes(profile) {
  if (!profile) return [];
  return profile.archetype?.secondary || profile.archetype_secondary || [];
}

function appendListItem(list, text, html = false) {
  const li = document.createElement("li");
  if (html) li.innerHTML = text;
  else li.textContent = text;
  list.appendChild(li);
}

function appendTipItems(list, tips) {
  for (const tip of tips || []) {
    const li = document.createElement("li");
    if (tip.title) {
      const strong = document.createElement("strong");
      strong.textContent = tip.title;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(" "));
    }
    const body = formatProfileTip(tip);
    if (body) li.appendChild(document.createTextNode(body));
    if (li.textContent?.trim()) list.appendChild(li);
  }
}

function appendConnections(list, connections) {
  for (const conn of connections || []) {
    if (conn.title) {
      appendListItem(list, `<strong>${escapeHtml(conn.title)}</strong> ${escapeHtml(conn.analysis || "")}`, true);
    } else if (conn.analysis) {
      appendListItem(list, conn.analysis);
    }
  }
}

function appendDataInsights(list, insights) {
  if (!insights || typeof insights !== "object") return;
  for (const [domain, items] of Object.entries(insights)) {
    for (const item of items || []) {
      appendListItem(list, `${domain}: ${item}`);
    }
  }
}

const onboardingEl = document.getElementById("onboarding");
const profileDashboardEl = document.getElementById("profile-dashboard");
const workspaceEl  = document.getElementById("workspace");
const messagesEl   = document.getElementById("messages");
const inputEl      = document.getElementById("user-input");
const sendBtn      = document.getElementById("send-btn");
const geneSection  = document.getElementById("gene-section");
const geneList     = document.getElementById("gene-list");
const labSection   = document.getElementById("lab-section");
const labReportList = document.getElementById("lab-report-list");
const metricsSection = document.getElementById("metrics-section");
const metricsList  = document.getElementById("metrics-list");

const steps = [
  document.getElementById("step-welcome"),
  document.getElementById("step-upload"),
  document.getElementById("step-wearable"),
];
const dots = document.querySelectorAll(".step-dots .dot");

/* ── Onboarding persistence ─────────────────────────────────────── */
function loadOnboarding() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveOnboarding(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadOnboarding(), ...data }));
}

function showStep(index) {
  currentStep = index;
  steps.forEach((el, i) => el.classList.toggle("active", i === index));
  dots.forEach((el, i) => el.classList.toggle("active", i === index));
}

function goToWelcome() {
  saveOnboarding({ complete: false, dashboardViewed: false });
  uploadedLabFiles.clear();
  labFileList.innerHTML = "";
  document.getElementById("genesight-label")?.classList.remove("loaded");
  setWizardUploadState("genesight", "idle", "");
  workspaceEl.classList.add("hidden");
  profileDashboardEl.classList.add("hidden");
  profileDashboardEl.classList.remove("detail-open");
  document.getElementById("dashboard-detail")?.classList.add("hidden");
  document.getElementById("dashboard-hub")?.classList.remove("hidden");
  document.getElementById("detail-back")?.classList.add("hidden");
  onboardingEl.classList.remove("hidden");
  showStep(0);
}

document.getElementById("home-logo")?.addEventListener("click", goToWelcome);
document.getElementById("home-logo")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    goToWelcome();
  }
});

function finishOnboarding() {
  saveOnboarding({ complete: true, dashboardViewed: true, name: userName });
  onboardingEl.classList.add("hidden");
  profileDashboardEl.classList.add("hidden");
  workspaceEl.classList.remove("hidden");
  enterWorkspace();
}

function formatProfileTip(tip) {
  if (!tip) return "";
  let text = tip.what || "";
  if (tip.why) text += (text ? " — " : "") + tip.why;
  if (tip.watch_for) text += ` (Watch: ${tip.watch_for})`;
  return text;
}

function setHubStatus(message, isError = false) {
  const status = document.getElementById("dashboard-status");
  if (!status) return;
  status.textContent = message || "";
  status.classList.toggle("error", isError);
}

function setHubBlobsEnabled(enabled) {
  document.querySelectorAll(".hub-blob").forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function openDashboardDetail(sectionId) {
  const cfg = DASHBOARD_SECTIONS[sectionId];
  if (!cfg) return;

  profileDashboardEl.classList.add("detail-open");
  document.getElementById("dashboard-hub").classList.add("hidden");
  document.getElementById("dashboard-detail").classList.remove("hidden");
  document.getElementById("detail-back").classList.remove("hidden");

  document.getElementById("detail-title").textContent = cfg.title;
  const subtitleEl = document.getElementById("detail-subtitle");
  subtitleEl.textContent = cfg.subtitle || "";
  subtitleEl.style.display = cfg.subtitle ? "block" : "none";

  const list = document.getElementById("detail-list");
  list.innerHTML = "";

  const page = cachedProfile?.[cfg.pageKey] || {};
  let subtitle = cfg.subtitle;

  if (sectionId === "story") {
    const primary = getPrimaryArchetype(cachedProfile);
    if (primary.name) {
      const score = primary.score != null ? ` (${primary.score}/100)` : "";
      appendListItem(list, `Archetype: ${primary.name}${score}`, false);
      appendListItem(list, primary.confidence ? `${primary.confidence} confidence` : "", false);
    }
    for (const sec of getSecondaryArchetypes(cachedProfile)) {
      if (!sec?.name) continue;
      appendListItem(list, `Secondary: ${sec.name}${sec.score != null ? ` · ${sec.score}` : ""}`);
    }
    if (cachedProfile?.archetype?.narrative) {
      appendListItem(list, cachedProfile.archetype.narrative);
    }
    const plain = page.plain_explanation || {};
    if (plain.headline) appendListItem(list, plain.headline);
    if (plain.body) appendListItem(list, plain.body);
    if (plain.analogy) appendListItem(list, `Analogy: ${plain.analogy}`);
    appendConnections(list, page.connections);
    appendDataInsights(list, page.data_at_a_glance);
    for (const cite of page.literature_citations || []) {
      appendListItem(list, cite.summary ? `${cite.topic}: ${cite.summary}` : cite.topic || "");
    }
  } else if (sectionId === "training") {
    if (page.hero_summary) appendListItem(list, page.hero_summary);
    appendDataInsights(list, page.data_insights);
    appendTipItems(list, page.tips || cachedProfile?.training);
    if (page.this_week_focus) appendListItem(list, `This week: ${page.this_week_focus}`);
    appendConnections(list, page.connections);
  } else if (sectionId === "fuel") {
    if (page.hero_summary) appendListItem(list, page.hero_summary);
    appendDataInsights(list, page.data_insights);
    appendTipItems(list, page.tips || cachedProfile?.nutrition);
    for (const note of page.stack_notes || []) {
      appendListItem(list, note.note ? `${note.item}: ${note.note}` : note.item || "");
    }
    for (const add of page.suggested_additions || []) {
      appendListItem(list, `Consider: ${add}`);
    }
    appendConnections(list, page.connections);
  } else if (sectionId === "recovery") {
    const hero = page.hero || {};
    if (hero.summary) appendListItem(list, hero.summary);
    if (hero.recovery_score || hero.sleep_score) {
      appendListItem(list, `Recovery: ${hero.recovery_score || "—"} · Sleep: ${hero.sleep_score || "—"}`);
    }
    appendDataInsights(list, page.data_insights);
    appendTipItems(list, page.sleep_tips);
    appendTipItems(list, page.recovery_tips || cachedProfile?.recovery);
    if (page.tonight_action) appendListItem(list, `Tonight: ${page.tonight_action}`);
    appendConnections(list, page.connections);
  }

  if (subtitle && page.hero_summary && sectionId !== "story") {
    subtitleEl.textContent = page.hero_summary;
  } else {
    subtitleEl.textContent = subtitle || "";
  }
  subtitleEl.style.display = subtitleEl.textContent ? "block" : "none";

  if (!list.children.length) {
    appendListItem(list, "e.g. recommendations based on your genes, labs, and wearables");
  }

  document.getElementById("detail-ama").dataset.prompt = cfg.amaPrompt;
}

function closeDashboardDetail() {
  profileDashboardEl.classList.remove("detail-open");
  document.getElementById("dashboard-detail").classList.add("hidden");
  document.getElementById("dashboard-hub").classList.remove("hidden");
  document.getElementById("detail-back").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProfileDashboard(profile) {
  cachedProfile = profile;

  const primary = getPrimaryArchetype(profile);
  const archetypeId = (primary.id || "").toLowerCase();
  const avatar = document.getElementById("dashboard-avatar");
  avatar.className = "hub-avatar";
  if (ARCHETYPE_IDS.includes(archetypeId)) {
    avatar.classList.add(`archetype-${archetypeId}`);
  }

  const badge = document.getElementById("hub-archetype-badge");
  if (primary.name) {
    badge.textContent = primary.name;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  setHubBlobsEnabled(true);
  setHubStatus("Tap a section to explore your profile");
}

async function showProfileDashboard(metrics) {
  document.getElementById("dashboard-retry")?.remove();
  onboardingEl.classList.add("hidden");
  workspaceEl.classList.add("hidden");
  profileDashboardEl.classList.remove("hidden");
  profileDashboardEl.classList.remove("detail-open");
  document.getElementById("dashboard-hub").classList.remove("hidden");
  document.getElementById("dashboard-detail").classList.add("hidden");
  document.getElementById("detail-back").classList.add("hidden");

  document.getElementById("dashboard-name").textContent = userName || "there";
  setHubBlobsEnabled(false);
  setHubStatus("Analyzing your profile…");
  document.getElementById("hub-archetype-badge").classList.add("hidden");
  cachedMetrics = metrics;

  try {
    const res = await fetch(`${API}/profile/analyze`, { method: "POST" });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(formatApiError(data, res.status));
    renderProfileDashboard(data.profile);
  } catch (err) {
    setHubBlobsEnabled(true);
    setHubStatus(formatFetchError(err), true);
    const hub = document.getElementById("dashboard-hub");
    if (hub && !document.getElementById("dashboard-retry")) {
      const retry = document.createElement("button");
      retry.id = "dashboard-retry";
      retry.className = "wizard-link";
      retry.type = "button";
      retry.textContent = "Retry analysis";
      retry.style.marginTop = "8px";
      retry.onclick = () => showProfileDashboard(metrics);
      hub.appendChild(retry);
    }
  }
}

document.querySelectorAll(".hub-blob").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!btn.disabled) openDashboardDetail(btn.dataset.section);
  });
});

document.getElementById("detail-back")?.addEventListener("click", closeDashboardDetail);

document.getElementById("detail-to-chat")?.addEventListener("click", finishOnboarding);

document.getElementById("detail-ama")?.addEventListener("click", () => {
  const prompt = document.getElementById("detail-ama").dataset.prompt || "";
  finishOnboarding();
  if (prompt) setTimeout(() => send(prompt), 400);
});

document.getElementById("dashboard-continue")?.addEventListener("click", finishOnboarding);

function enterWorkspace() {
  document.getElementById("sidebar-name").textContent = userName || "there";
  if (!messagesEl.children.length) {
    const archetype = getPrimaryArchetype(cachedProfile).name;
    const intro = archetype
      ? `You're classified as <strong>${escapeHtml(archetype)}</strong>. Ask me to go deeper on any correlation or recommendation.`
      : `Hi ${escapeHtml(userName || "there")} — ask me anything about your lab results, genetics, and wearable data. ` +
        `I'll connect the dots across your reports and biometrics.`;
    addAiMessage(intro);
  }
}

/* ── Step 1: Name ───────────────────────────────────────────────── */
const nameInput = document.getElementById("name-input");
const welcomeBtn = document.getElementById("welcome-continue");

nameInput.addEventListener("input", () => {
  welcomeBtn.disabled = !nameInput.value.trim();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && nameInput.value.trim()) welcomeBtn.click();
});

welcomeBtn.addEventListener("click", () => {
  userName = nameInput.value.trim();
  document.getElementById("display-name").textContent = userName;
  saveOnboarding({ name: userName });
  showStep(1);
});

/* ── Step 2: Lab uploads ────────────────────────────────────────── */
const labFileList = document.getElementById("lab-file-list");
const uploadContinueBtn = document.getElementById("upload-continue");
let uploadedLabFiles = new Set();

document.getElementById("skip-upload").addEventListener("click", () => showStep(2));
uploadContinueBtn.addEventListener("click", () => showStep(2));

function renderLabFileList() {
  // list is built incrementally in upload handler
}

function addLabFileRow(name, ok = true, subtitle = "") {
  const li = document.createElement("li");
  li.innerHTML = subtitle
    ? `<span>${truncate(name, 32)}</span><span class="lab-file-sub">${subtitle}</span>`
    : truncate(name, 36);
  if (!ok) li.classList.add("failed");
  labFileList.appendChild(li);
}

function labUploadSummary(data) {
  const reports = data.lab_reports || [];
  const geneCount = Object.keys(data.genes || {}).length;
  const markerCount = reports.reduce((n, r) => n + Object.keys(r.markers || {}).length, 0);
  const parts = [`${reports.length} report(s)`];
  if (markerCount) parts.push(`${markerCount} marker(s)`);
  if (geneCount) parts.push(`${geneCount} gene(s)`);
  return parts.join(" · ");
}

const REPORT_LABELS = {
  bloodwork: "Bloodwork",
  genetic: "Genetic",
  ancestry: "Ancestry",
  microbiome: "Microbiome",
  other: "Lab report",
};

function renderLabReports(reports) {
  labReportList.innerHTML = "";
  if (!reports.length) {
    labSection.style.display = "none";
    return;
  }
  for (const report of reports) {
    const row = document.createElement("div");
    row.className = "lab-report-row";
    row.innerHTML = `
      <div class="lab-report-type">${REPORT_LABELS[report.report_type] || "Lab report"}</div>
      <div class="lab-report-name">${escapeHtml(truncate(report.filename || "Report", 28))}</div>
      <div class="lab-report-summary">${escapeHtml(truncate(report.summary || "", 80))}</div>
    `;
    labReportList.appendChild(row);
  }
  labSection.style.display = "block";
}

document.getElementById("genesight-input").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const newFiles = files.filter((f) => !uploadedLabFiles.has(f.name));
  if (!newFiles.length) {
    setWizardUploadState("genesight", "ok", `${uploadedLabFiles.size} file(s) already added`);
    e.target.value = "";
    return;
  }

  setWizardUploadState("genesight", "loading", `Parsing ${newFiles.length} PDF${newFiles.length > 1 ? "s" : ""}…`);

  const form = new FormData();
  for (const file of newFiles) form.append("files", file);

  try {
    const res = await fetch(`${API}/upload/lab-reports/batch`, { method: "POST", body: form });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(formatApiError(data, res.status));

    for (const name of data.files_processed || []) {
      uploadedLabFiles.add(name);
      const report = (data.lab_reports || []).find((r) => r.filename === name);
      const subtitle = report
        ? REPORT_LABELS[report.report_type] || "Lab report"
        : "";
      addLabFileRow(name, true, subtitle);
    }
    for (const fail of data.files_failed || []) {
      addLabFileRow(fail.filename, false, "Could not read");
    }

    document.getElementById("genesight-label").classList.add("loaded");
    setWizardUploadState("genesight", "ok", labUploadSummary(data));
    renderLabReports(data.lab_reports || []);
    if (data.genes && Object.keys(data.genes).length) renderGenes(data.genes);
  } catch (err) {
    setWizardUploadState("genesight", "error", formatFetchError(err));
  }

  e.target.value = "";
});

/* ── Step 3: Wearable connect ───────────────────────────────────── */
function openAppleUpload() {
  document.getElementById("apple-input").click();
}

const JUNCTION_PROVIDERS = {
  oura: "Oura",
  fitbit: "Fitbit",
  garmin: "Garmin",
};

document.querySelectorAll(".wearable-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".wearable-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    const wearable = btn.dataset.wearable;
    if (wearable === "apple") {
      setWizardUploadState("apple", "idle", "Upload Apple Health export.xml");
      openAppleUpload();
    } else {
      connectJunctionWearable(wearable);
    }
  });
});

document.getElementById("wearable-other").addEventListener("click", openAppleUpload);
document.getElementById("skip-wearable").addEventListener("click", finishOnboarding);

document.getElementById("apple-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setWizardUploadState("apple", "loading", `Syncing ${file.name}…`);
  const form = new FormData();
  form.append("file", file);
  if (userName) form.append("client_user_id", userName);

  try {
    const res = await fetch(`${API}/upload/apple-health`, { method: "POST", body: form });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(formatApiError(data, res.status));

    renderMetrics(data.metrics);
    let status = `${Object.keys(data.metrics).length} metrics synced`;
    if (data.junction?.sources?.length) {
      status += ` · Junction (${data.junction.sources.join(", ")})`;
    }
    if (data.junction?.errors?.length) {
      status += ` · ${data.junction.errors[0]}`;
    }
    setWizardUploadState("apple", "ok", status);
    setTimeout(() => showProfileDashboard(data.metrics), 600);
  } catch (err) {
    setWizardUploadState("apple", "error", formatFetchError(err));
    e.target.value = "";
  }
});

async function connectJunctionWearable(wearable) {
  const label = JUNCTION_PROVIDERS[wearable] || wearable;
  setWizardUploadState("apple", "loading", `Connecting ${label}…`);

  const form = new FormData();
  form.append("provider", wearable);
  form.append("client_user_id", userName || "genofit-local");
  form.append(
    "redirect_url",
    `${window.location.origin}${window.location.pathname}?junction_provider=${encodeURIComponent(wearable)}`
  );

  try {
    const res = await fetch(`${API}/junction/connect`, { method: "POST", body: form });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(formatApiError(data, res.status));

    if (data.link_web_url) {
      window.location.href = data.link_web_url;
      return;
    }

    renderMetrics(data.metrics);
    const count = Object.keys(data.metrics || {}).filter(
      (k) => !k.startsWith("junction_") && k !== "sources"
    ).length;
    const mode = data.connection?.mode;
    let status = count
      ? `${count} metrics synced`
      : mode === "demo"
        ? `${label} demo data connected — syncing may take a moment`
        : `${label} connected`;
    if (data.junction?.sources?.length) {
      status += ` · Junction (${data.junction.sources.join(", ")})`;
    }
    if (data.junction?.errors?.length) {
      status += ` · ${data.junction.errors[0]}`;
    }
    setWizardUploadState("apple", "ok", status);
    setTimeout(() => showProfileDashboard(data.metrics), count ? 600 : 1200);
  } catch (err) {
    setWizardUploadState("apple", "error", formatFetchError(err));
  }
}

async function syncJunctionWearables(wearableLabel) {
  setWizardUploadState("apple", "loading", `Syncing ${wearableLabel} via Junction…`);
  const form = new FormData();
  if (userName) form.append("client_user_id", userName);

  try {
    const res = await fetch(`${API}/junction/sync`, { method: "POST", body: form });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(formatApiError(data, res.status));

    renderMetrics(data.metrics);
    const count = Object.keys(data.metrics || {}).filter(
      (k) => !k.startsWith("junction_") && k !== "sources"
    ).length;
    const connected = data.junction?.connected_providers || [];
    let status;
    if (count) {
      status = `${count} metrics synced`;
    } else if (connected.length) {
      status = `${wearableLabel} connected — data may take a few minutes to appear`;
    } else {
      status = "No metrics yet — connect a device first";
    }
    if (data.junction?.sources?.length) {
      status += ` · Junction (${data.junction.sources.join(", ")})`;
    }
    if (data.junction?.errors?.length) {
      status += ` · ${data.junction.errors[0]}`;
    }
    setWizardUploadState("apple", "ok", status);
    if (count || connected.length) {
      setTimeout(() => showProfileDashboard(data.metrics), connected.length && !count ? 1200 : 600);
    }
  } catch (err) {
    setWizardUploadState("apple", "error", formatFetchError(err));
  }
}

async function handleJunctionOAuthReturn() {
  const params = new URLSearchParams(location.search);
  const provider = params.get("junction_provider");
  const state = params.get("state");
  if (!provider) return false;

  history.replaceState({}, "", location.pathname);
  onboardingEl.classList.remove("hidden");
  workspaceEl.classList.add("hidden");
  showStep(2);

  const label = JUNCTION_PROVIDERS[provider] || provider;
  if (state !== "success") {
    const detail = params.get("error") || params.get("detail") || "Connection was cancelled or failed.";
    setWizardUploadState("apple", "error", `${label}: ${detail}`);
    return true;
  }

  await syncJunctionWearables(label);
  return true;
}

function setWizardUploadState(which, state, text) {
  const status = document.getElementById(`${which}-status`);
  status.textContent = state === "loading" ? text : state === "error" ? text : text;
  status.classList.toggle("error", state === "error");
}

/* ── Render sidebar data ────────────────────────────────────────── */
function renderGenes(genes) {
  geneList.innerHTML = "";
  for (const [gene, info] of Object.entries(genes)) {
    const dot = getDotClass(info.phenotype);
    const row = document.createElement("div");
    row.className = "gene-row";
    row.innerHTML = `
      <span class="gene-name">${gene}</span>
      <span class="gene-pheno" title="${info.phenotype}">${info.variant || info.phenotype}</span>
      <div class="gene-dot ${dot}"></div>
    `;
    geneList.appendChild(row);
  }
  geneSection.style.display = "block";
}

function getDotClass(phenotype = "") {
  const p = phenotype.toLowerCase();
  if (p.includes("poor") || p.includes("low") || p.includes("decreased") || p.includes("s/s")) return "dot-red";
  if (p.includes("ultra") || p.includes("rapid")) return "dot-yellow";
  if (p.includes("normal") || p.includes("extensive") || p.includes("wild")) return "dot-green";
  return "dot-yellow";
}

function renderMetrics(metrics) {
  metricsList.innerHTML = "";
  const LABELS = {
    hrv:             m => [`HRV`, `${m.latest_ms ?? m.avg_ms} ms`],
    resting_hr:      m => [`Resting HR`, `${m.latest_bpm ?? m.avg_bpm} bpm`],
    spo2:            m => [`SpO2`, `${m.latest_pct ?? m.avg_pct}%`],
    sleep:           m => [`Sleep`, `${m.avg_hours} hrs/night`],
    steps:           m => [`Steps`, `${Math.round(m.avg_daily).toLocaleString()}/day`],
    vo2_max:         m => [`VO2 Max`, `${m.latest} mL/kg/min`],
    active_calories: m => [`Active cal`, `${Math.round(m.avg_daily_kcal)}/day`],
  };

  for (const [key, fmt] of Object.entries(LABELS)) {
    if (!metrics[key]) continue;
    const [label, val] = fmt(metrics[key]);
    const row = document.createElement("div");
    row.className = "metric-row";
    row.innerHTML = `<span class="metric-label">${label}</span><span class="metric-val">${val}</span>`;
    metricsList.appendChild(row);
  }
  metricsSection.style.display = "block";
}

/* ── Chat ───────────────────────────────────────────────────────── */
async function send(overrideText) {
  const text = overrideText ?? inputEl.value.trim();
  if (!text || isLoading) return;

  inputEl.value = "";
  autoResize(inputEl);
  addUserMessage(text);
  setLoading(true);

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(formatApiError(data, res.status));
    addAiMessage(data.reply);
  } catch (err) {
    addAiMessage(`Something went wrong: ${formatFetchError(err)}`, true);
  }

  setLoading(false);
}

function sendChip(text) { send(text); }

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "msg user";
  div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addAiMessage(html, isError = false) {
  document.getElementById("typing-msg")?.remove();
  const div = document.createElement("div");
  div.className = "msg ai";
  div.innerHTML = `
    <div class="avatar">G</div>
    <div class="bubble${isError ? " error" : ""}">${html}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "msg ai";
  div.id = "typing-msg";
  div.innerHTML = `
    <div class="avatar">G</div>
    <div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function setLoading(val) {
  isLoading = val;
  sendBtn.disabled = val;
  inputEl.disabled = val;
  if (val) showTyping();
  else document.getElementById("typing-msg")?.remove();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ── Session / reset ────────────────────────────────────────────── */
async function resetAllData() {
  try {
    await fetch(`${API}/session`, { method: "DELETE" });
  } catch {
    // Backend may be offline — still clear local state
  }
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.clear();
}

async function clearSession() {
  await resetAllData();
  location.href = location.pathname;
}

function showResetLink(hasData) {
  const btn = document.getElementById("reset-data-btn");
  if (btn && hasData) btn.classList.remove("hidden");
}

document.getElementById("reset-data-btn")?.addEventListener("click", clearSession);

/* ── Utilities ──────────────────────────────────────────────────── */
async function parseApiResponse(res) {
  try { return await res.json(); }
  catch { throw new Error(`Server error (${res.status})`); }
}

function formatApiError(data, status) {
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map((d) => d.msg).join(", ");
  return `Request failed (${status})`;
}

function formatFetchError(err) {
  if (err.message === "Failed to fetch") {
    return `Could not reach the backend at ${API.replace("/api", "")}. Start it with: cd backend && python3 main.py`;
  }
  return err.message;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function restoreChatHistory(history) {
  if (!history.length) return;
  messagesEl.innerHTML = "";
  for (const turn of history) {
    if (turn.role === "user") addUserMessage(turn.content);
    else if (turn.role === "assistant") addAiMessage(escapeHtml(turn.content));
  }
}

/* ── Init ───────────────────────────────────────────────────────── */
(async () => {
  if (new URLSearchParams(location.search).get("reset") === "1") {
    await resetAllData();
    history.replaceState({}, "", location.pathname);
  }

  const saved = loadOnboarding();
  if (saved.name) {
    userName = saved.name;
    nameInput.value = saved.name;
    welcomeBtn.disabled = false;
    document.getElementById("display-name").textContent = saved.name;
  }

  if (await handleJunctionOAuthReturn()) return;

  try {
    const res = await fetch(`${API}/session`);
    const data = await res.json();
    if (data.has_lab_reports) renderLabReports(data.lab_reports || []);
    if (data.has_genes) renderGenes(data.genes);
    if (data.has_lab_reports || data.has_genes) {
      setWizardUploadState("genesight", "ok", labUploadSummary(data));
      document.getElementById("genesight-label")?.classList.add("loaded");
    }
    if (data.has_metrics) renderMetrics(data.metrics);
    if (data.profile && Object.keys(data.profile).length) {
      cachedProfile = data.profile;
      cachedMetrics = data.metrics;
    }

    const hasData = data.has_genes || data.has_metrics || data.has_lab_reports || (data.history_length > 0);
    showResetLink(hasData || saved.complete);

    const onboardingDone = saved.complete === true;
    const dashboardViewed = saved.dashboardViewed === true;

    if (onboardingDone && dashboardViewed) {
      onboardingEl.classList.add("hidden");
      profileDashboardEl.classList.add("hidden");
      workspaceEl.classList.remove("hidden");
      enterWorkspace();
      restoreChatHistory(data.history || []);
    } else if (onboardingDone && data.has_profile && data.has_metrics && !dashboardViewed) {
      onboardingEl.classList.add("hidden");
      workspaceEl.classList.add("hidden");
      profileDashboardEl.classList.remove("hidden");
      profileDashboardEl.classList.remove("detail-open");
      document.getElementById("dashboard-hub").classList.remove("hidden");
      document.getElementById("dashboard-detail").classList.add("hidden");
      document.getElementById("detail-back").classList.add("hidden");
      document.getElementById("dashboard-name").textContent = userName || "there";
      renderProfileDashboard(data.profile);
    } else if (onboardingDone) {
      onboardingEl.classList.add("hidden");
      profileDashboardEl.classList.add("hidden");
      workspaceEl.classList.remove("hidden");
      enterWorkspace();
      restoreChatHistory(data.history || []);
    } else {
      showStep(0);
    }
  } catch {
    if (saved.complete) showResetLink(true);
    showStep(0);
  }
})();
