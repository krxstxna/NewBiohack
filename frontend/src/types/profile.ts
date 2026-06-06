export type PodId = "training" | "fuel" | "recovery" | "story";

export type RadarSectionId = PodId;

export interface GeneInfo {
  phenotype?: string;
  variant?: string;
}

export interface LabReport {
  filename?: string;
  report_type?: string;
  summary?: string;
  markers?: Record<string, unknown>;
}

export interface Profile {
  archetype?: {
    primary?: { id?: string; name?: string; score?: number; confidence?: string };
    secondary?: { name?: string; score?: number }[];
    tagline?: string;
    scores?: Record<string, number>;
    vq_cluster_label?: string;
    vq_story_line?: string;
    vq_pattern_bullets?: string[];
    narrative?: string;
  };
  your_story?: ProfilePage;
  train?: ProfilePage;
  fuel?: ProfilePage;
  rest_recovery?: ProfilePage;
  training?: ProfileTip[];
  nutrition?: ProfileTip[];
  recovery?: ProfileTip[];
}

export interface ProfileTip {
  title?: string;
  what?: string;
  why?: string;
  watch_for?: string;
}

export interface VisualMetric {
  id?: string;
  label?: string;
  value?: string | number;
  unit?: string;
  score?: number;
  min?: number;
  max?: number;
  normalized?: number;
}

export interface ProfilePage {
  bubble_teaser?: string;
  hero_summary?: string;
  bullet_summary?: string[];
  recommendation_sections?: Record<string, string[]>;
  tips?: ProfileTip[];
  sleep_tips?: ProfileTip[];
  recovery_tips?: ProfileTip[];
  data_insights?: Record<string, string[]>;
  connections?: { title?: string; analysis?: string }[];
  data_at_a_glance?: Record<string, string | number>;
  visual_metrics?: VisualMetric[];
  chat_starters?: string[];
  this_week_focus?: string;
  watch_for?: string;
  tonight?: string;
  tonight_action?: string;
  hero?: { summary?: string; recovery_score?: string; sleep_score?: string };
  stack_notes?:
    | string[]
    | {
        metabolism_summary?: string;
        item_notes?: { item?: string; note?: string }[];
        suggested_additions?: string[];
        avoid?: string[];
      };
  plain_explanation?: { headline?: string; body?: string; analogy?: string };
  literature?: { topic?: string; summary?: string; pmid?: string }[];
  literature_citations?: { topic?: string; summary?: string; pmid?: string }[];
}

export interface Metrics {
  hrv?: { latest_ms?: number; avg_ms?: number };
  resting_hr?: { latest_bpm?: number; avg_bpm?: number };
  sleep?: { avg_hours?: number; avg_deep_min?: number; avg_rem_min?: number };
  steps?: { avg_daily?: number };
  spo2?: { latest_pct?: number; avg_pct?: number };
  vo2_max?: { latest?: number };
  active_calories?: { avg_daily_kcal?: number };
  charts?: Record<string, { date: string; value: number }[]>;
}

export interface SessionData {
  has_profile?: boolean;
  has_metrics?: boolean;
  has_genes?: boolean;
  has_lab_reports?: boolean;
  profile?: Profile;
  metrics?: Metrics;
  genes?: Record<string, GeneInfo>;
  lab_reports?: LabReport[];
  history?: { role: string; content: string }[];
  history_length?: number;
}

export interface DetailLine {
  text: string;
  bold?: boolean;
}

export const ARCHETYPE_TAGLINES: Record<string, string> = {
  forge: "You burn long, not bright",
  drift: "Performance follows calm",
  volt: "High-fidelity biology",
  titan: "Slow power, deep recovery",
  blitz: "Metabolism moves fast",
  pulse: "Your heart leads",
  surge: "Pressure builds beneath",
  prime: "Clean signal, pure execution",
};

export const POD_AMA: Record<PodId, string> = {
  training: "Tell me more about my training recommendations based on my genetics, labs, and wearables.",
  fuel: "Tell me more about my nutrition and fuel recommendations based on my data.",
  recovery: "Tell me more about my recovery and sleep recommendations.",
  story: "Explain my archetype and how my genes connect to my wearable and lab data.",
};

export const RADAR_SECTIONS: Record<
  RadarSectionId,
  { title: string; pageKey: keyof Profile; color: string }
> = {
  training: { title: "Training signals", pageKey: "train", color: "rgba(234, 88, 12, 0.9)" },
  fuel: { title: "Fuel signals", pageKey: "fuel", color: "rgba(22, 163, 74, 0.9)" },
  recovery: { title: "Recovery signals", pageKey: "rest_recovery", color: "rgba(37, 99, 235, 0.9)" },
  story: { title: "Your Story signals", pageKey: "your_story", color: "rgba(126, 34, 206, 0.9)" },
};

export const REPORT_LABELS: Record<string, string> = {
  bloodwork: "Bloodwork",
  genetic: "Genetic",
  ancestry: "Ancestry",
  microbiome: "Microbiome",
  other: "Lab report",
};

export const SUGGESTION_CHIPS: { label: string; prompt: string }[] = [
  { label: "Why is my HRV low?", prompt: "Why is my HRV lower than average?" },
  { label: "COMT & stress recovery", prompt: "What does my COMT genotype mean for stress and recovery?" },
  { label: "Genes & sleep", prompt: "How do my genes affect my sleep quality?" },
  { label: "Genes & sleep data", prompt: "Explain my sleep using my gene data" },
];

export const POD_CONFIG: Record<
  PodId,
  { label: string; pageKey: keyof Profile; shift: { x: number; y: number }; radius: string; hoverRadius: string }
> = {
  training: {
    label: "Training",
    pageKey: "train",
    shift: { x: 12, y: 12 },
    radius: "60% 40% 30% 70% / 60% 30% 70% 40%",
    hoverRadius: "50% 50% 40% 60% / 55% 45% 65% 35%",
  },
  fuel: {
    label: "Fuel",
    pageKey: "fuel",
    shift: { x: -12, y: 12 },
    radius: "40% 60% 70% 30% / 40% 70% 30% 60%",
    hoverRadius: "45% 55% 60% 40% / 50% 60% 40% 50%",
  },
  recovery: {
    label: "Rest + Recovery",
    pageKey: "rest_recovery",
    shift: { x: 12, y: -12 },
    radius: "50% 50% 40% 60% / 55% 45% 65% 35%",
    hoverRadius: "60% 40% 35% 65% / 50% 40% 60% 50%",
  },
  story: {
    label: "Your Story",
    pageKey: "your_story",
    shift: { x: -12, y: -12 },
    radius: "45% 55% 60% 40% / 50% 60% 40% 50%",
    hoverRadius: "40% 60% 65% 35% / 45% 55% 55% 45%",
  },
};
