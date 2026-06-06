/* ── Config ─────────────────────────────────────────────────────── */
const API = "http://localhost:8000";

/* ── State ──────────────────────────────────────────────────────── */
let isLoading = false;

/* ── DOM refs ───────────────────────────────────────────────────── */
const messagesEl   = document.getElementById("messages");
const inputEl      = document.getElementById("user-input");
const sendBtn      = document.getElementById("send-btn");
const geneSection  = document.getElementById("gene-section");
const geneList     = document.getElementById("gene-list");
const metricsSection = document.getElementById("metrics-section");
const metricsList  = document.getElementById("metrics-list");

/* ── Upload: GeneSight PDF ──────────────────────────────────────── */
document.getElementById("genesight-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setUploadState("genesight", "loading", `Parsing ${file.name}…`);

  const form = new FormData();
  form.append("file", file);

  try {
    const res = await fetch(`${API}/upload/genesight`, { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Upload failed");

    setUploadState("genesight", "ok", file.name);
    renderGenes(data.genes);
    addAiMessage(`✓ I've read your GeneSight report. Found <strong>${Object.keys(data.genes).length} genes</strong>: ${Object.keys(data.genes).join(", ")}. Ask me anything about how they affect your health data.`);
  } catch (err) {
    setUploadState("genesight", "error", `Error: ${err.message}`);
  }
});

/* ── Upload: Apple Health XML ───────────────────────────────────── */
document.getElementById("apple-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setUploadState("apple", "loading", `Parsing ${file.name}… (this may take a moment)`);

  const form = new FormData();
  form.append("file", file);

  try {
    const res = await fetch(`${API}/upload/apple-health`, { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Upload failed");

    setUploadState("apple", "ok", file.name);
    renderMetrics(data.metrics);

    const keys = Object.keys(data.metrics);
    addAiMessage(`✓ Apple Health data loaded — I found <strong>${keys.length} metric categories</strong>: ${keys.join(", ")}. Now I can give you genetically-contextualized explanations for your readings.`);
  } catch (err) {
    setUploadState("apple", "error", `Error: ${err.message}`);
  }
});

/* ── Upload state helper ────────────────────────────────────────── */
function setUploadState(which, state, text) {
  const label    = document.getElementById(`${which}-label`);
  const filename = document.getElementById(`${which}-filename`);
  const status   = document.getElementById(`${which}-status`);

  filename.textContent = state === "loading" ? "Uploading…" : truncate(text, 26);
  status.textContent   = state === "loading" ? "Processing…" :
                         state === "error"   ? text : "";

  label.classList.toggle("loaded", state === "ok");
}

function truncate(str, n) { return str.length > n ? str.slice(0, n - 1) + "…" : str; }

/* ── Render gene sidebar ────────────────────────────────────────── */
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

/* ── Render metrics sidebar ─────────────────────────────────────── */
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
    const res  = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Request failed");
    addAiMessage(data.reply);
  } catch (err) {
    addAiMessage(`Something went wrong: ${err.message}`, true);
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

/* ── Message rendering ──────────────────────────────────────────── */
function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "msg user";
  div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addAiMessage(html, isError = false) {
  // Remove typing indicator if present
  const typing = document.getElementById("typing-msg");
  if (typing) typing.remove();

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
  else {
    const t = document.getElementById("typing-msg");
    if (t) t.remove();
  }
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ── Session ────────────────────────────────────────────────────── */
async function clearSession() {
  await fetch(`${API}/session`, { method: "DELETE" });
  geneSection.style.display = "none";
  metricsSection.style.display = "none";
  geneList.innerHTML = "";
  metricsList.innerHTML = "";
  messagesEl.innerHTML = "";
  setUploadState("genesight", "idle", "Upload PDF report");
  setUploadState("apple", "idle", "Upload export.xml");
  addAiMessage("Session cleared. Upload your files to start again.");
}

/* ── Utilities ──────────────────────────────────────────────────── */
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ── Init: load session state if server already has data ─────────── */
(async () => {
  try {
    const res  = await fetch(`${API}/session`);
    const data = await res.json();
    if (data.has_genes)   renderGenes(data.genes);
    if (data.has_metrics) renderMetrics(data.metrics);
  } catch {
    // Server not running yet — that's fine
  }
})();
