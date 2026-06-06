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

const onboardingEl = document.getElementById("onboarding");
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
  saveOnboarding({ complete: false });
  uploadedLabFiles.clear();
  labFileList.innerHTML = "";
  document.getElementById("genesight-label")?.classList.remove("loaded");
  setWizardUploadState("genesight", "idle", "");
  workspaceEl.classList.add("hidden");
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
  saveOnboarding({ complete: true, name: userName });
  onboardingEl.classList.add("hidden");
  workspaceEl.classList.remove("hidden");
  enterWorkspace();
}

function enterWorkspace() {
  document.getElementById("sidebar-name").textContent = userName || "there";
  if (!messagesEl.children.length) {
    addAiMessage(
      `Hi ${escapeHtml(userName || "there")} — ask me anything about your lab results, genetics, and wearable data. ` +
      `I'll connect the dots across your reports and biometrics.`
    );
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

document.querySelectorAll(".wearable-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".wearable-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    setWizardUploadState("apple", "idle", "Upload Apple Health export.xml");
    openAppleUpload();
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

  try {
    const res = await fetch(`${API}/upload/apple-health`, { method: "POST", body: form });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(formatApiError(data, res.status));

    renderMetrics(data.metrics);
    setWizardUploadState("apple", "ok", `${Object.keys(data.metrics).length} metrics synced`);
    setTimeout(finishOnboarding, 600);
  } catch (err) {
    setWizardUploadState("apple", "error", formatFetchError(err));
    e.target.value = "";
  }
});

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

    const hasData = data.has_genes || data.has_metrics || data.has_lab_reports || (data.history_length > 0);
    showResetLink(hasData || saved.complete);

    // Only skip onboarding if user explicitly finished it (not just because data exists)
    const onboardingDone = saved.complete === true;

    if (onboardingDone) {
      onboardingEl.classList.add("hidden");
      workspaceEl.classList.remove("hidden");
      enterWorkspace();
      restoreChatHistory(data.history || []);
    } else if (hasData) {
      showStep(1);
    }
  } catch {
    if (saved.complete) showResetLink(true);
  }
})();
