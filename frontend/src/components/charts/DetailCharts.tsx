import { useEffect, useRef } from "react";
import type { Chart } from "chart.js";
import type { ChartSpec } from "../../lib/chartHelpers";

function ChartCard({ spec }: { spec: ChartSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    chartRef.current = spec.build(canvasRef.current);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [spec]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{spec.title}</h3>
      <div className="h-44">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export function DetailCharts({ specs }: { specs: ChartSpec[] }) {
  if (!specs.length) return null;
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {specs.map((spec) => (
        <ChartCard key={spec.title} spec={spec} />
      ))}
    </div>
  );
}
