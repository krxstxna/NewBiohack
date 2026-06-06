import { useMemo } from "react";
import { Button } from "../ui/Button";
import type { Metrics, PodId, Profile } from "../../types/profile";
import { POD_CONFIG } from "../../types/profile";
import { buildDetailLines, getAmaPrompt, getArchetypeTagline } from "../../lib/profileContent";
import { getArchetypeHeader } from "../../lib/profileHelpers";
import { buildDetailChartSpecs } from "../../lib/chartHelpers";
import { DetailCharts } from "../charts/DetailCharts";

interface ProfileDetailProps {
  podId: PodId;
  profile: Profile | null;
  metrics: Metrics | null;
  onBack: () => void;
  onContinueChat: () => void;
  onAskInChat: (message: string) => void;
}

export function ProfileDetail({ podId, profile, metrics, onBack, onContinueChat, onAskInChat }: ProfileDetailProps) {
  const cfg = POD_CONFIG[podId];
  const { name } = getArchetypeHeader(profile);
  const tagline = getArchetypeTagline(profile);
  const lines = buildDetailLines(podId, profile);
  const page = (profile?.[cfg.pageKey] || {}) as { hero_summary?: string; chat_starters?: string[] };
  const chartSpecs = useMemo(() => buildDetailChartSpecs(podId, metrics, profile), [podId, metrics, profile]);
  const amaPrompt = getAmaPrompt(podId);

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/70 px-4 py-4 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Button variant="secondary" className="px-4 py-2 text-xs" onClick={onBack}>
            ← Back
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-slate-800 sm:text-2xl">{name || cfg.label}</h2>
            <p className="truncate text-sm italic text-slate-500">{tagline || cfg.label}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <article className="rounded-[32px] border border-slate-100 bg-white/70 p-6 shadow-sm backdrop-blur-md sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{cfg.label}</p>
          {page.hero_summary ? <p className="mt-3 text-lg font-semibold text-slate-800">{page.hero_summary}</p> : null}
          <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span aria-hidden="true">☰</span> (based on your info)
          </p>

          <DetailCharts specs={chartSpecs} />

          <ul className="mt-6 space-y-3">
            {lines.map((line, i) => (
              <li key={i} className="border-b border-slate-100 pb-3 text-sm leading-relaxed text-slate-800 last:border-0">
                {line.bold ? <strong>{line.text}</strong> : line.text}
              </li>
            ))}
          </ul>

          {page.chat_starters?.length ? (
            <div className="mt-8 flex flex-wrap gap-2">
              {page.chat_starters.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onAskInChat(chip)}
                  className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button variant="secondary" onClick={() => onAskInChat(amaPrompt)}>
              AMA / add info
            </Button>
            <Button onClick={onContinueChat}>Continue to chat</Button>
          </div>
        </article>
      </main>
    </div>
  );
}
