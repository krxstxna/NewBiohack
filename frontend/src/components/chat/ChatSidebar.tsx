import { GenoFitLogo } from "../ui/GenoFitLogo";
import { Button } from "../ui/Button";
import type { GeneInfo, LabReport, Metrics } from "../../types/profile";
import { REPORT_LABELS, SUGGESTION_CHIPS } from "../../types/profile";
import { formatMetricsRows, getGeneDotClass } from "../../lib/radarHelpers";

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

interface ChatSidebarProps {
  userName: string;
  genes: Record<string, GeneInfo>;
  labReports: LabReport[];
  metrics: Metrics | null;
  onGoHome: () => void;
  onOpenProfile: () => void;
  onStartOver: () => void;
  onSendChip: (prompt: string) => void;
}

export function ChatSidebar({
  userName,
  genes,
  labReports,
  metrics,
  onGoHome,
  onOpenProfile,
  onStartOver,
  onSendChip,
}: ChatSidebarProps) {
  const geneEntries = Object.entries(genes);
  const metricRows = formatMetricsRows(metrics);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-100 bg-white/70 backdrop-blur-md lg:w-72 lg:border-b-0 lg:border-r">
      <button
        type="button"
        onClick={onGoHome}
        className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 text-left transition-colors hover:bg-slate-50"
        title="Back to home"
      >
        <div className="shrink-0 rounded-xl bg-slate-900 px-2.5 py-1.5 shadow-sm">
          <GenoFitLogo className="h-7 w-auto" />
        </div>
        <p className="text-xs text-slate-500">Hi, {userName || "there"}</p>
      </button>

      {labReports.length > 0 ? (
        <section className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lab Reports</p>
          <div className="mt-2 space-y-2">
            {labReports.map((report, i) => (
              <div key={`${report.filename}-${i}`} className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-700">{REPORT_LABELS[report.report_type || ""] || "Lab report"}</p>
                <p className="text-xs text-slate-700">{truncate(report.filename || "Report", 28)}</p>
                {report.summary ? <p className="mt-0.5 text-xs text-slate-500">{truncate(report.summary, 80)}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {geneEntries.length > 0 ? (
        <section className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your Genes</p>
          <div className="mt-2 space-y-1.5">
            {geneEntries.map(([gene, info]) => (
              <div key={gene} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 font-semibold text-slate-800">{gene}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500" title={info.phenotype}>
                  {info.variant || info.phenotype}
                </span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${getGeneDotClass(info.phenotype)}`} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {metricRows.length > 0 ? (
        <section className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest Metrics</p>
          <div className="mt-2 space-y-1.5">
            {metricRows.map((row) => (
              <div key={row.label} className="flex justify-between text-xs">
                <span className="text-slate-500">{row.label}</span>
                <span className="font-medium text-slate-800">{row.value}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-b border-slate-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Try asking</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onSendChip(chip.prompt)}
              className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-auto flex flex-col gap-2 px-4 py-4">
        <Button variant="secondary" className="w-full py-2 text-xs" onClick={onOpenProfile}>
          My profile
        </Button>
        <button type="button" onClick={onStartOver} className="text-xs text-slate-500 underline hover:text-slate-700">
          Start over
        </button>
      </div>
    </aside>
  );
}
