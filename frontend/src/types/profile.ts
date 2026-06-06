export type PodId = "training" | "fuel" | "recovery" | "story";

export interface Profile {
  archetype?: {
    primary?: { id?: string; name?: string; score?: number; confidence?: string };
    secondary?: { name?: string; score?: number }[];
    tagline?: string;
    scores?: Record<string, number>;
    vq_cluster_label?: string;
    vq_story_line?: string;
    narrative?: string;
  };
  your_story?: ProfilePage;
  train?: ProfilePage;
  fuel?: ProfilePage;
  rest_recovery?: ProfilePage;
}

export interface ProfilePage {
  bubble_teaser?: string;
  hero_summary?: string;
  bullet_summary?: string[];
  recommendation_sections?: Record<string, string[]>;
  tips?: { title?: string; what?: string; why?: string }[];
}

export interface Metrics {
  hrv?: { latest_ms?: number; avg_ms?: number };
  resting_hr?: { latest_bpm?: number; avg_bpm?: number };
  sleep?: { avg_hours?: number; avg_deep_min?: number; avg_rem_min?: number };
  steps?: { avg_daily?: number };
  spo2?: { latest_pct?: number };
  charts?: Record<string, { date: string; value: number }[]>;
}

export interface SessionData {
  has_profile?: boolean;
  has_metrics?: boolean;
  profile?: Profile;
  metrics?: Metrics;
  history?: { role: string; content: string }[];
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
