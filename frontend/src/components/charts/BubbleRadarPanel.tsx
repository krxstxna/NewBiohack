import { useEffect, useMemo, useRef, useState } from "react";
import type { Chart } from "chart.js";
import type { Profile, RadarSectionId } from "../../types/profile";
import { RADAR_SECTIONS } from "../../types/profile";
import { buildRadarChart } from "../../lib/chartHelpers";
import { chartNarrative, profileRadarPoints, radarEligibleSections } from "../../lib/radarHelpers";

interface BubbleRadarPanelProps {
  profile: Profile | null;
}

export function BubbleRadarPanel({ profile }: BubbleRadarPanelProps) {
  const eligible = useMemo(() => radarEligibleSections(profile), [profile]);
  const [active, setActive] = useState<RadarSectionId>("training");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (eligible.length && !eligible.includes(active)) {
      setActive(eligible[0]);
    }
  }, [eligible, active]);

  const points = useMemo(() => profileRadarPoints(active, profile), [active, profile]);
  const cfg = RADAR_SECTIONS[active];
  const avg = points.length ? Math.round(points.reduce((s, p) => s + p.score, 0) / points.length) : null;
  const summary = chartNarrative(active, profile, points);

  useEffect(() => {
    if (!canvasRef.current || points.length < 3) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }
    chartRef.current?.destroy();
    chartRef.current = buildRadarChart(
      canvasRef.current,
      points.map((p) => p.label),
      points.map((p) => p.score),
      cfg.color,
      cfg.title,
    );
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [points, cfg.color, cfg.title]);

  if (!eligible.length) return null;

  return (
    <section className="hidden min-w-0 flex-1 rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm backdrop-blur-md lg:block" aria-label="Bubble radar chart">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Bubble chart</p>
          <h2 className="text-base font-bold text-slate-800">{cfg.title}</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{avg == null ? "--" : `${avg}/100`}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Choose profile bubble">
        {(Object.keys(RADAR_SECTIONS) as RadarSectionId[]).map((id) => {
          const isEligible = eligible.includes(id);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              disabled={!isEligible}
              title={isEligible ? undefined : "Add more relevant data for this bubble to generate a chart."}
              onClick={() => setActive(id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                active === id ? "bg-emerald-500 text-white" : isEligible ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "cursor-not-allowed bg-slate-50 text-slate-300"
              }`}
            >
              {RADAR_SECTIONS[id].title.replace(" signals", "").replace("Your Story", "Story")}
            </button>
          );
        })}
      </div>

      <div className="relative mt-3 h-52">
        {points.length >= 3 ? (
          <canvas ref={canvasRef} />
        ) : (
          <p className="flex h-full items-center justify-center text-center text-sm text-slate-500">
            Add more relevant data for this bubble to generate a chart.
          </p>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{summary}</p>
    </section>
  );
}
