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
const chatPanel    = document.getElementById("chat-panel");
const vqPanel      = document.getElementById("vq-panel");
const navChatBtn   = document.getElementById("nav-chat");
const navVqBtn     = document.getElementById("nav-vq");
const geneSection  = document.getElementById("gene-section");
const geneList     = document.getElementById("gene-list");
const metricsSection = document.getElementById("metrics-section");
const metricsList  = document.getElementById("metrics-list");
let sessionGenes   = {};
let sessionMetrics = {};

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
      `Hi ${escapeHtml(userName || "there")} — ask me anything about your genetics and wearable data. ` +
      `I'll explain your readings in the context of your gene profile.`
    );
  }
  showWorkspacePanel(location.hash === "#health-codes" ? "vq" : "chat");
  prefillVqInputs(false);
}

function showWorkspacePanel(panel) {
  const showVq = panel === "vq";
  chatPanel.classList.toggle("hidden", showVq);
  vqPanel.classList.toggle("hidden", !showVq);
  navChatBtn?.classList.toggle("active", !showVq);
  navVqBtn?.classList.toggle("active", showVq);
  if (showVq) {
    if (location.hash !== "#health-codes") history.replaceState({}, "", "#health-codes");
    prefillVqInputs(false);
  } else if (location.hash === "#health-codes") {
    history.replaceState({}, "", location.pathname + location.search);
  }
}

navChatBtn?.addEventListener("click", () => showWorkspacePanel("chat"));
navVqBtn?.addEventListener("click", () => showWorkspacePanel("vq"));

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

function addLabFileRow(name, ok = true) {
  const li = document.createElement("li");
  li.textContent = truncate(name, 36);
  if (!ok) li.classList.add("failed");
  labFileList.appendChild(li);
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
    const res = await fetch(`${API}/upload/genesight/batch`, { method: "POST", body: form });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(formatApiError(data, res.status));

    for (const name of data.files_processed || []) {
      uploadedLabFiles.add(name);
      addLabFileRow(name, true);
    }
    for (const fail of data.files_failed || []) {
      addLabFileRow(`${fail.filename}: ${fail.error}`, false);
    }

    document.getElementById("genesight-label").classList.add("loaded");
    const geneCount = Object.keys(data.genes || {}).length;
    setWizardUploadState(
      "genesight",
      "ok",
      `${uploadedLabFiles.size} file(s) · ${geneCount} genes total`
    );
    renderGenes(data.genes);
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
  sessionGenes = genes || {};
  geneList.innerHTML = "";
  for (const [gene, info] of Object.entries(sessionGenes)) {
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
  sessionMetrics = metrics || {};
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
    if (!sessionMetrics[key]) continue;
    const [label, val] = fmt(sessionMetrics[key]);
    const row = document.createElement("div");
    row.className = "metric-row";
    row.innerHTML = `<span class="metric-label">${label}</span><span class="metric-val">${val}</span>`;
    metricsList.appendChild(row);
  }
  metricsSection.style.display = "block";
  prefillVqInputs(false);
}

/* ── Vector quantization health codes ───────────────────────────── */
const VQ_FIELDS = {
  hrv: "vq-hrv",
  restingHr: "vq-rhr",
  sleepHours: "vq-sleep",
  vo2Max: "vq-vo2",
  steps: "vq-steps",
  activeMinutes: "vq-active-min",
  ldl: "vq-ldl",
  hdl: "vq-hdl",
  triglycerides: "vq-trig",
  crp: "vq-crp",
  glucose: "vq-glucose",
  vitaminD: "vq-vitd",
};

const VQ_AXES = ["sympathetic", "lipid", "metabolic", "fitness", "pharma", "recovery"];

const HEALTH_CODEBOOK = [
  {
    code: "HC-01",
    name: "Balanced recovery phenotype",
    centroid: { sympathetic: 0.22, lipid: 0.24, metabolic: 0.2, fitness: 0.78, pharma: 0.18, recovery: 0.78 },
    explanation: "Your pattern is closest to a lower-load cluster with stronger recovery reserve and fewer medication-response flags.",
  },
  {
    code: "HC-03",
    name: "High sympathetic load",
    centroid: { sympathetic: 0.86, lipid: 0.34, metabolic: 0.42, fitness: 0.42, pharma: 0.34, recovery: 0.24 },
    explanation: "Your wearable pattern resembles a cluster where low HRV, higher resting heart rate, or short sleep dominate the signal.",
  },
  {
    code: "HC-07",
    name: "Stress-linked lipid sensitivity",
    centroid: { sympathetic: 0.74, lipid: 0.82, metabolic: 0.54, fitness: 0.46, pharma: 0.34, recovery: 0.28 },
    explanation: "Your lab and wearable pattern resembles a cluster associated with sympathetic load plus lipid sensitivity.",
  },
  {
    code: "HC-11",
    name: "Metabolic inflammation pattern",
    centroid: { sympathetic: 0.52, lipid: 0.56, metabolic: 0.86, fitness: 0.34, pharma: 0.28, recovery: 0.34 },
    explanation: "Your values are closest to a cluster where inflammatory or glucose/lipid markers carry the strongest signal.",
  },
  {
    code: "HC-14",
    name: "Pharmacogenomic caution pattern",
    centroid: { sympathetic: 0.44, lipid: 0.34, metabolic: 0.34, fitness: 0.48, pharma: 0.88, recovery: 0.44 },
    explanation: "Your GeneSight context is closest to a cluster where medication metabolism or receptor-response markers matter most.",
  },
  {
    code: "HC-18",
    name: "Endurance-adaptive phenotype",
    centroid: { sympathetic: 0.32, lipid: 0.24, metabolic: 0.24, fitness: 0.92, pharma: 0.24, recovery: 0.7 },
    explanation: "Your pattern resembles an activity-adapted cluster with stronger cardiorespiratory and run/walk signals.",
  },
];

const AXIS_COPY = {
  sympathetic: {
    label: "Sympathetic load",
    high: "low HRV, higher resting HR, short sleep, or stress-related gene context",
    low: "wearables do not suggest a high acute stress-load signal",
  },
  lipid: {
    label: "Lipid sensitivity",
    high: "LDL/triglyceride pattern or APOE/lipid genetics is pulling the match upward",
    low: "lipid inputs are not the dominant driver",
  },
  metabolic: {
    label: "Metabolic inflammation",
    high: "hs-CRP, glucose, triglycerides, vitamin D, or methylation context is elevated",
    low: "metabolic inflammation inputs are not the dominant driver",
  },
  fitness: {
    label: "Cardiorespiratory fitness",
    high: "VO2 max, steps, run/walk minutes, or lower resting HR are strong",
    low: "activity and fitness signals are not yet strong in this input set",
  },
  pharma: {
    label: "Medication-response sensitivity",
    high: "CYP, serotonin, dopamine, or opioid-response markers are influencing the cluster",
    low: "GeneSight medication-response flags are not dominant",
  },
  recovery: {
    label: "Recovery reserve",
    high: "HRV, sleep, inflammation, and resting HR point toward better recovery capacity",
    low: "recovery reserve is being pulled down by wearable or lab signals",
  },
};

function prefillVqInputs(showStatus = true, overwrite = false) {
  if (!document.getElementById("vq-hrv")) return;

  const metrics = sessionMetrics || {};
  setVqInput("hrv", metrics.hrv?.avg_ms ?? metrics.hrv?.latest_ms, overwrite);
  setVqInput("restingHr", metrics.resting_hr?.avg_bpm ?? metrics.resting_hr?.latest_bpm, overwrite);
  setVqInput("sleepHours", metrics.sleep?.avg_hours, overwrite);
  setVqInput("vo2Max", metrics.vo2_max?.latest, overwrite);
  setVqInput("steps", metrics.steps?.avg_daily, overwrite);

  if (showStatus) {
    const count = Object.values(metrics).filter(Boolean).length + Object.keys(sessionGenes || {}).length;
    setVqStatus(count ? "Uploaded data loaded" : "Add data");
  }
}

function setVqInput(key, value, overwrite) {
  const input = document.getElementById(VQ_FIELDS[key]);
  if (!input || value == null || Number.isNaN(Number(value))) return;
  if (!overwrite && input.value) return;
  input.value = Number(value).toFixed(Number(value) % 1 ? 1 : 0);
}

function readVqInputs() {
  const values = {};
  for (const [key, id] of Object.entries(VQ_FIELDS)) {
    const raw = document.getElementById(id)?.value;
    const value = raw === "" || raw == null ? null : Number(raw);
    values[key] = Number.isFinite(value) ? value : null;
  }
  return values;
}

function generateHealthCode() {
  const inputs = readVqInputs();
  const geneAnalysis = analyzeGeneContext(sessionGenes);
  const numericEvidence = Object.values(inputs).filter((v) => v != null).length;
  const geneEvidence = Object.keys(sessionGenes || {}).length;

  if (numericEvidence + geneEvidence === 0) {
    document.getElementById("vq-empty").textContent =
      "Add at least one wearable, lab, activity, or GeneSight value before generating a health code.";
    document.getElementById("vq-empty").classList.remove("hidden");
    document.getElementById("vq-result").classList.add("hidden");
    setVqStatus("Needs data");
    return;
  }

  const embedding = buildHealthEmbedding(inputs, geneAnalysis);
  const match = quantizeEmbedding(embedding, numericEvidence + geneEvidence);
  renderVqResult(match, embedding, inputs, geneAnalysis);
}

function buildHealthEmbedding(inputs, geneAnalysis) {
  const gene = geneAnalysis.scores;
  const geneValue = (score) => score > 0 ? score : null;

  const sympathetic = averageKnown([
    scaleHigh(inputs.restingHr, 55, 85),
    scaleLow(inputs.hrv, 20, 70),
    scaleLow(inputs.sleepHours, 5, 8.5),
    geneValue(gene.sympathetic),
  ]);

  const lipid = averageKnown([
    scaleHigh(inputs.ldl, 90, 190),
    scaleHigh(inputs.triglycerides, 80, 250),
    scaleLow(inputs.hdl, 35, 70),
    geneValue(gene.lipid),
  ]);

  const metabolic = averageKnown([
    scaleHigh(inputs.crp, 0.5, 5),
    scaleHigh(inputs.glucose, 85, 125),
    scaleHigh(inputs.triglycerides, 80, 250),
    scaleLow(inputs.vitaminD, 15, 45),
    geneValue(gene.metabolic),
  ]);

  const fitness = averageKnown([
    scaleHigh(inputs.vo2Max, 25, 55),
    scaleHigh(inputs.steps, 2500, 12000),
    scaleHigh(inputs.activeMinutes, 60, 300),
    scaleLow(inputs.restingHr, 50, 80),
  ]);

  const pharma = averageKnown([geneValue(gene.pharma)], 0.18);

  const recovery = averageKnown([
    scaleHigh(inputs.hrv, 20, 70),
    scaleHigh(inputs.sleepHours, 5, 8.5),
    scaleLow(inputs.restingHr, 55, 85),
    scaleLow(inputs.crp, 0.5, 5),
    scaleHigh(inputs.vitaminD, 15, 45),
  ]);

  return { sympathetic, lipid, metabolic, fitness, pharma, recovery };
}

function quantizeEmbedding(embedding, evidenceCount) {
  const ranked = HEALTH_CODEBOOK.map((prototype) => {
    const distance = Math.sqrt(
      VQ_AXES.reduce((sum, axis) => sum + Math.pow(embedding[axis] - prototype.centroid[axis], 2), 0) /
      VQ_AXES.length
    );
    return { prototype, distance };
  }).sort((a, b) => a.distance - b.distance);

  const best = ranked[0];
  const second = ranked[1];
  const margin = second ? second.distance - best.distance : 0;
  const completeness = clamp(evidenceCount / 10, 0.25, 1);
  const confidence = clamp(0.52 + margin * 0.6 + completeness * 0.22, 0.55, 0.94);

  return { ...best, confidence, ranked };
}

function renderVqResult(match, embedding, inputs, geneAnalysis) {
  const { prototype, confidence } = match;
  document.getElementById("vq-empty").classList.add("hidden");
  document.getElementById("vq-result").classList.remove("hidden");
  document.getElementById("vq-code").textContent = prototype.code;
  document.getElementById("vq-code-name").textContent = prototype.name;
  document.getElementById("vq-confidence").textContent = `Prototype match ${Math.round(confidence * 100)}%`;
  document.getElementById("vq-summary").textContent = prototype.explanation;
  setVqStatus("Clustered");

  renderInsightList("vq-signals", rankSignals(embedding, inputs));
  renderInsightList("vq-genetics", geneAnalysis.notes.length ? geneAnalysis.notes : [
    "No GeneSight markers are loaded yet. Upload a GeneSight PDF to anchor medication-response and genetics context.",
  ]);
  renderInsightList("vq-next", nextDataSuggestions(inputs, geneAnalysis));
}

function rankSignals(embedding, inputs) {
  const items = [];
  const add = (score, html) => items.push({ score, html });

  add(embedding.sympathetic, describeAxis("sympathetic", embedding.sympathetic));
  add(embedding.lipid, describeAxis("lipid", embedding.lipid));
  add(embedding.metabolic, describeAxis("metabolic", embedding.metabolic));
  add(embedding.fitness, describeAxis("fitness", embedding.fitness));
  add(embedding.pharma, describeAxis("pharma", embedding.pharma));
  add(1 - embedding.recovery, describeAxis("recovery", embedding.recovery));

  const valueDetails = [];
  if (inputs.ldl != null) valueDetails.push(`LDL ${inputs.ldl} mg/dL`);
  if (inputs.hrv != null) valueDetails.push(`HRV ${inputs.hrv} ms`);
  if (inputs.restingHr != null) valueDetails.push(`resting HR ${inputs.restingHr} bpm`);
  if (inputs.crp != null) valueDetails.push(`hs-CRP ${inputs.crp} mg/L`);
  if (valueDetails.length) {
    add(0.99, `<strong>Raw anchors:</strong> ${escapeHtml(valueDetails.join(", "))}`);
  }

  return items
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.html);
}

function describeAxis(axis, value) {
  const copy = AXIS_COPY[axis];
  const direction = axis === "recovery"
    ? (value >= 0.55 ? "higher" : "lower")
    : (value >= 0.55 ? "higher" : "lower");
  const explanation = value >= 0.55 ? copy.high : copy.low;
  return `<strong>${copy.label}:</strong> ${direction} (${Math.round(value * 100)}%). ${explanation}.`;
}

function analyzeGeneContext(genes = {}) {
  const notes = [];
  const scores = { sympathetic: 0, lipid: 0, metabolic: 0, pharma: 0 };
  const entries = Object.entries(genes || {});
  const get = (gene) => genes[gene] || genes[gene.toUpperCase()] || genes[gene.toLowerCase()];

  const comt = get("COMT");
  if (comt && geneBlob(comt).match(/low|met\/met|val\/met|decreased/)) {
    scores.sympathetic += 0.55;
    notes.push(`<strong>COMT:</strong> ${escapeHtml(geneLabel(comt))} can make catecholamine/stress-load interpretation more important.`);
  }

  const slc6a4 = get("SLC6A4");
  if (slc6a4 && geneBlob(slc6a4).match(/\bs\/s\b|\bl\/s\b|short|reduced|intermediate/)) {
    scores.sympathetic += 0.25;
    scores.pharma += 0.28;
    notes.push(`<strong>SLC6A4:</strong> ${escapeHtml(geneLabel(slc6a4))} adds serotonin-response context for stress, sleep, and SSRI interpretation.`);
  }

  const apoe = get("APOE");
  if (apoe) {
    scores.lipid += geneBlob(apoe).match(/e4|ε4|increased|risk/) ? 0.75 : 0.45;
    notes.push(`<strong>APOE:</strong> ${escapeHtml(geneLabel(apoe))} is treated as a lipid-sensitivity anchor when interpreting LDL patterns.`);
  }

  const mthfr = get("MTHFR");
  if (mthfr && geneBlob(mthfr).match(/c677t|a1298c|homozygous|heterozygous|decreased/)) {
    scores.metabolic += 0.4;
    notes.push(`<strong>MTHFR:</strong> ${escapeHtml(geneLabel(mthfr))} can contextualize methylation-related labs such as homocysteine, B vitamins, and inflammation.`);
  }

  const cypEntries = entries.filter(([gene, info]) =>
    gene.toUpperCase().startsWith("CYP") &&
    geneBlob(info).match(/poor|intermediate|rapid|ultrarapid|decreased|increased/)
  );
  if (cypEntries.length) {
    scores.pharma += Math.min(0.74, 0.18 * cypEntries.length);
    notes.push(`<strong>CYP metabolism:</strong> ${escapeHtml(cypEntries.map(([gene]) => gene).join(", "))} markers affect medication response and dose sensitivity.`);
  }

  const neuroGenes = entries.filter(([gene]) =>
    ["HTR2A", "HTR2C", "DRD2", "ANKK1", "OPRM1", "ABCB1"].includes(gene.toUpperCase())
  );
  if (neuroGenes.length) {
    scores.pharma += Math.min(0.45, 0.12 * neuroGenes.length);
    notes.push(`<strong>Receptor/transport markers:</strong> ${escapeHtml(neuroGenes.map(([gene]) => gene).join(", "))} can help explain psychiatric medication fit beyond basic metabolism.`);
  }

  for (const key of Object.keys(scores)) scores[key] = clamp(scores[key], 0, 1);
  return { scores, notes };
}

function nextDataSuggestions(inputs, geneAnalysis) {
  const suggestions = [];
  const hasLabs = ["ldl", "hdl", "triglycerides", "crp", "glucose"].some((key) => inputs[key] != null);
  const hasWearables = ["hrv", "restingHr", "sleepHours", "steps"].some((key) => inputs[key] != null);

  if (!hasWearables) suggestions.push("Upload Apple Health export.xml or enter HRV, resting HR, sleep, and steps to align sparse labs with recent physiology.");
  if (!hasLabs) suggestions.push("Add LDL, HDL, triglycerides, fasting glucose, and hs-CRP to separate lipid sensitivity from metabolic inflammation.");
  if (!sessionGenes?.APOE) suggestions.push("Add APOE or lipid polygenic-risk context if the product needs stronger LDL explanations.");
  if (!geneAnalysis.notes.length) suggestions.push("Upload GeneSight data to connect the cluster to medication metabolism and receptor-response markers.");
  suggestions.push("Clinically anchor each health code with expert labels or post-hoc enrichment before using it for decisions.");

  return suggestions.slice(0, 4).map(escapeHtml);
}

function renderInsightList(id, items) {
  const el = document.getElementById(id);
  el.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function setVqStatus(text) {
  const el = document.getElementById("vq-status");
  if (el) el.textContent = text;
}

function scaleHigh(value, low, high) {
  if (value == null) return null;
  return clamp((value - low) / (high - low), 0, 1);
}

function scaleLow(value, low, high) {
  if (value == null) return null;
  return clamp((high - value) / (high - low), 0, 1);
}

function averageKnown(values, fallback = 0.45) {
  const known = values.filter((v) => Number.isFinite(v));
  if (!known.length) return fallback;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function geneBlob(info = {}) {
  return `${info.variant || ""} ${info.phenotype || ""}`.toLowerCase();
}

function geneLabel(info = {}) {
  return [info.variant, info.phenotype].filter(Boolean).join(" / ") || "marker detected";
}

document.getElementById("prefill-vq-btn")?.addEventListener("click", () => prefillVqInputs(true, true));
document.getElementById("run-vq-btn")?.addEventListener("click", generateHealthCode);
document.querySelectorAll("#vq-panel input").forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") generateHealthCode();
  });
});

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
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(str, maxLen) {
  const text = String(str ?? "");
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
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
    if (data.has_genes) {
      renderGenes(data.genes);
      setWizardUploadState("genesight", "ok", `${Object.keys(data.genes).length} genes loaded`);
      document.getElementById("genesight-label")?.classList.add("loaded");
    }
    if (data.has_metrics) renderMetrics(data.metrics);

    const hasData = data.has_genes || data.has_metrics || (data.history_length > 0);
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
