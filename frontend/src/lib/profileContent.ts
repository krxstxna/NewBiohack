import type { DetailLine, PodId, Profile, ProfilePage, ProfileTip } from "../types/profile";
import { ARCHETYPE_TAGLINES, POD_AMA } from "../types/profile";

function getPrimaryArchetype(profile: Profile | null) {
  if (!profile) return {};
  return profile.archetype?.primary || {};
}

function getSecondaryArchetypes(profile: Profile | null) {
  if (!profile) return [];
  return profile.archetype?.secondary || [];
}

function formatProfileTip(tip: ProfileTip) {
  if (!tip) return "";
  let text = tip.what || "";
  if (tip.why) text += (text ? " — " : "") + tip.why;
  if (tip.watch_for) text += ` (Watch: ${tip.watch_for})`;
  return text;
}

function pushLine(lines: DetailLine[], text: string, bold = false) {
  if (text?.trim()) lines.push({ text: text.trim(), bold });
}

function pushTips(lines: DetailLine[], tips?: ProfileTip[]) {
  for (const tip of tips || []) {
    const body = formatProfileTip(tip);
    if (tip.title && body) pushLine(lines, `${tip.title} — ${body}`, !!tip.title);
    else if (tip.title) pushLine(lines, tip.title, true);
    else if (body) pushLine(lines, body);
  }
}

function pushConnections(lines: DetailLine[], connections?: ProfilePage["connections"]) {
  for (const conn of connections || []) {
    if (conn.title) pushLine(lines, `${conn.title} ${conn.analysis || ""}`.trim(), true);
    else if (conn.analysis) pushLine(lines, conn.analysis);
  }
}

function pushDataInsights(lines: DetailLine[], insights?: Record<string, string[]>) {
  if (!insights) return;
  for (const [domain, items] of Object.entries(insights)) {
    for (const item of items || []) pushLine(lines, `${domain}: ${item}`);
  }
}

function pushBullets(lines: DetailLine[], bullets?: string[]) {
  for (const bullet of bullets || []) pushLine(lines, bullet);
}

function pushVisualMetrics(lines: DetailLine[], metrics?: ProfilePage["visual_metrics"]) {
  for (const m of metrics || []) {
    if (!m?.label) continue;
    const val = m.value != null && m.value !== "" ? m.value : "—";
    const unit = m.unit ? ` ${m.unit}` : "";
    pushLine(lines, `${m.label}: ${val}${unit}`);
  }
}

function pushStackNotes(lines: DetailLine[], stackNotes?: ProfilePage["stack_notes"]) {
  if (!stackNotes) return;
  if (Array.isArray(stackNotes)) {
    for (const note of stackNotes) pushLine(lines, typeof note === "string" ? note : "");
    return;
  }
  if (stackNotes.metabolism_summary) pushLine(lines, stackNotes.metabolism_summary);
  for (const note of stackNotes.item_notes || []) {
    pushLine(lines, note.note ? `${note.item}: ${note.note}` : note.item || "");
  }
  for (const add of stackNotes.suggested_additions || []) pushLine(lines, `Consider: ${add}`);
  for (const avoid of stackNotes.avoid || []) pushLine(lines, `Avoid: ${avoid}`);
}

function pushRecommendationSections(lines: DetailLine[], sections?: Record<string, string[]>) {
  if (!sections) return;
  const headings: [string, string][] = [
    ["from_your_genetics", "From your genetics"],
    ["from_your_data", "From your data"],
    ["from_research", "From research"],
  ];
  for (const [key, label] of headings) {
    const bullets = sections[key];
    if (!bullets?.length) continue;
    pushLine(lines, label, true);
    for (const bullet of bullets) pushLine(lines, bullet);
  }
}

function pushDataAtAGlance(lines: DetailLine[], glance?: Record<string, string | number>) {
  if (!glance) return;
  for (const [key, val] of Object.entries(glance)) {
    pushLine(lines, `${key.replace(/_/g, " ")}: ${val}`);
  }
}

export function buildDetailLines(podId: PodId, profile: Profile | null): DetailLine[] {
  const pageKey = (
    { training: "train", fuel: "fuel", recovery: "rest_recovery", story: "your_story" } as const
  )[podId];
  const page = (profile?.[pageKey] || {}) as ProfilePage;
  const lines: DetailLine[] = [];

  if (podId === "story") {
    const arch = profile?.archetype || {};
    if (arch.vq_cluster_label) pushLine(lines, arch.vq_cluster_label);
    if (arch.vq_story_line) pushLine(lines, arch.vq_story_line);
    for (const bullet of arch.vq_pattern_bullets || []) pushLine(lines, bullet);

    const primary = getPrimaryArchetype(profile);
    if (primary.name) {
      const score = primary.score != null ? ` (${primary.score}/100)` : "";
      pushLine(lines, `Archetype: ${primary.name}${score}`);
      if (primary.confidence) pushLine(lines, `${primary.confidence} confidence`);
    }
    for (const sec of getSecondaryArchetypes(profile)) {
      if (!sec?.name) continue;
      pushLine(lines, `Secondary: ${sec.name}${sec.score != null ? ` · ${sec.score}` : ""}`);
    }
    if (arch.narrative) pushLine(lines, arch.narrative);
    const plain = page.plain_explanation || {};
    if (plain.headline) pushLine(lines, plain.headline);
    if (plain.body) pushLine(lines, plain.body);
    if (plain.analogy) pushLine(lines, `Analogy: ${plain.analogy}`);
    pushConnections(lines, page.connections);
    pushDataAtAGlance(lines, page.data_at_a_glance);
    pushBullets(lines, page.bullet_summary);
    pushVisualMetrics(lines, page.visual_metrics);
    const literature = page.literature || page.literature_citations || [];
    for (const cite of literature) {
      const pmid = cite.pmid ? ` (PMID ${cite.pmid})` : "";
      pushLine(lines, cite.summary ? `${cite.topic}: ${cite.summary}${pmid}` : cite.topic || "");
    }
  } else if (podId === "training") {
    if (page.hero_summary) pushLine(lines, page.hero_summary);
    pushDataInsights(lines, page.data_insights);
    pushRecommendationSections(lines, page.recommendation_sections);
    pushTips(lines, page.tips || profile?.training);
    pushBullets(lines, page.bullet_summary);
    pushVisualMetrics(lines, page.visual_metrics);
    if (page.this_week_focus) pushLine(lines, `This week: ${page.this_week_focus}`);
    if (page.watch_for) pushLine(lines, `Watch for: ${page.watch_for}`);
    pushConnections(lines, page.connections);
  } else if (podId === "fuel") {
    if (page.hero_summary) pushLine(lines, page.hero_summary);
    pushDataInsights(lines, page.data_insights);
    pushRecommendationSections(lines, page.recommendation_sections);
    pushTips(lines, page.tips || profile?.nutrition);
    pushBullets(lines, page.bullet_summary);
    pushVisualMetrics(lines, page.visual_metrics);
    pushStackNotes(lines, page.stack_notes);
    pushConnections(lines, page.connections);
  } else if (podId === "recovery") {
    if (page.hero_summary) pushLine(lines, page.hero_summary);
    const hero = page.hero || {};
    if (hero.summary) pushLine(lines, hero.summary);
    if (hero.recovery_score || hero.sleep_score) {
      pushLine(lines, `Recovery: ${hero.recovery_score || "—"} · Sleep: ${hero.sleep_score || "—"}`);
    }
    pushDataInsights(lines, page.data_insights);
    pushRecommendationSections(lines, page.recommendation_sections);
    pushTips(lines, page.sleep_tips);
    pushTips(lines, page.recovery_tips || profile?.recovery);
    pushBullets(lines, page.bullet_summary);
    pushVisualMetrics(lines, page.visual_metrics);
    if (page.tonight || page.tonight_action) pushLine(lines, `Tonight: ${page.tonight || page.tonight_action}`);
    pushConnections(lines, page.connections);
  }

  if (!lines.length) {
    pushLine(lines, "e.g. recommendations based on your genes, labs, and wearables");
  }

  return lines;
}

export function getAmaPrompt(podId: PodId) {
  return POD_AMA[podId];
}

export function getChatIntro(profile: Profile | null, userName: string) {
  const primary = getPrimaryArchetype(profile);
  const name = primary.name;
  if (name) {
    return `You're classified as <strong>${name}</strong>. Ask me to go deeper on any correlation or recommendation.`;
  }
  return (
    `Hi ${userName || "there"} — ask me anything about your lab results, genetics, and wearable data. ` +
    `I'll connect the dots across your reports and biometrics.`
  );
}

export function getArchetypeTagline(profile: Profile | null) {
  const primary = getPrimaryArchetype(profile);
  const id = (primary.id || "").toLowerCase();
  return profile?.archetype?.tagline || ARCHETYPE_TAGLINES[id] || "";
}
