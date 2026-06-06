import type { Metrics, PodId, Profile } from "../types/profile";
import { ARCHETYPE_TAGLINES, POD_CONFIG } from "../types/profile";

export function pickAvatar(): string {
  const key = "genofit_profile_avatar";
  const base = import.meta.env.BASE_URL;
  const avatars = [`${base}assets/avatars/avatar-peach.png`, `${base}assets/avatars/avatar-green.png`];
  const saved = localStorage.getItem(key);
  if (saved?.includes("avatar-peach.png")) return avatars[0];
  if (saved?.includes("avatar-green.png")) return avatars[1];
  const chosen = avatars[Math.floor(Math.random() * avatars.length)];
  localStorage.setItem(key, chosen);
  return chosen;
}

export function getArchetypeHeader(profile: Profile | null) {
  const primary = profile?.archetype?.primary;
  const id = (primary?.id || "").toLowerCase();
  const name = primary?.name || (id ? id.charAt(0).toUpperCase() + id.slice(1) : "");
  const tagline = profile?.archetype?.tagline || ARCHETYPE_TAGLINES[id] || "";
  return { name, tagline, id };
}

export function buildPodPreview(podId: PodId, profile: Profile | null, metrics: Metrics | null) {
  const cfg = POD_CONFIG[podId];
  const page = (profile?.[cfg.pageKey] || {}) as {
    bubble_teaser?: string;
    hero_summary?: string;
    bullet_summary?: string[];
  };

  const headline: string =
    page.bubble_teaser ||
    page.hero_summary ||
    page.bullet_summary?.[0] ||
    defaultHeadline(podId);

  let metric = "Sync wearables for live data";
  let context =
    page.hero_summary ||
    page.bullet_summary?.[1] ||
    "Your digital twin is learning from your uploads.";

  if (podId === "training") {
    const hrv = metrics?.hrv?.latest_ms ?? metrics?.hrv?.avg_ms;
    if (hrv) metric = `HRV: ${hrv}ms`;
    if (metrics?.steps?.avg_daily) metric += ` · Steps: ${Math.round(metrics.steps.avg_daily)}`;
  } else if (podId === "fuel") {
    const sleep = metrics?.sleep?.avg_hours;
    if (sleep) metric = `Sleep avg: ${sleep}h`;
    else metric = "Fuel profile ready";
  } else if (podId === "recovery") {
    const hrv = metrics?.hrv?.latest_ms ?? metrics?.hrv?.avg_ms;
    const rhr = metrics?.resting_hr?.latest_bpm ?? metrics?.resting_hr?.avg_bpm;
    if (hrv) metric = `HRV: ${hrv}ms`;
    if (rhr) metric += ` · RHR: ${rhr}bpm`;
  } else if (podId === "story") {
    const arch = profile?.archetype;
    metric = arch?.vq_cluster_label || arch?.primary?.name || "Archetype pending";
    context = arch?.vq_story_line || arch?.narrative || context;
  }

  return { headline, metric, context };
}

function defaultHeadline(podId: PodId) {
  switch (podId) {
    case "training":
      return "Ready to move";
    case "fuel":
      return "Fuel your day";
    case "recovery":
      return "Resting beautifully";
    case "story":
      return "Your genetic story";
  }
}

export function flattenPageContent(profile: Profile | null, podId: PodId): string[] {
  const cfg = POD_CONFIG[podId];
  const page = (profile?.[cfg.pageKey] || {}) as Record<string, unknown>;
  const lines: string[] = [];

  const sections = page.recommendation_sections as Record<string, string[]> | undefined;
  if (sections) {
    for (const [key, bullets] of Object.entries(sections)) {
      lines.push(key.replace(/_/g, " "));
      lines.push(...(bullets || []));
    }
  }
  const tips = page.tips as { title?: string; what?: string; why?: string }[] | undefined;
  for (const tip of tips || []) {
    lines.push([tip.title, tip.what, tip.why].filter(Boolean).join(" — "));
  }
  const bullets = page.bullet_summary as string[] | undefined;
  if (bullets) lines.push(...bullets);

  return lines.filter(Boolean);
}
