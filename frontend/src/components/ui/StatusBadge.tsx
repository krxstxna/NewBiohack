import type { ReactNode } from "react";

type Tone = "optimized" | "needs" | "critical";

const toneStyles: Record<Tone, string> = {
  optimized: "bg-emerald-500 text-emerald-700",
  needs: "bg-amber-500 text-amber-700",
  critical: "bg-rose-500 text-rose-700",
};

export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneStyles[tone]}`}>{children}</span>
  );
}
