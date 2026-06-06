import { useState } from "react";
import { motion } from "framer-motion";
import type { PodId } from "../../types/profile";
import { POD_CONFIG } from "../../types/profile";

export interface PodPreview {
  headline: string;
  metric: string;
  context: string;
}

interface EcosystemPodProps {
  podId: PodId;
  preview: PodPreview;
  disabled?: boolean;
  onOpen: () => void;
}

export function EcosystemPod({ podId, preview, disabled, onOpen }: EcosystemPodProps) {
  const [hovered, setHovered] = useState(false);
  const cfg = POD_CONFIG[podId];

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="flex min-h-[168px] w-full max-w-[320px] flex-col items-start justify-center border border-slate-100 bg-white/70 p-5 text-left shadow-sm backdrop-blur-md transition-shadow duration-200 ease-out hover:shadow-md disabled:cursor-wait disabled:opacity-50 sm:min-h-[190px] sm:max-w-[340px] sm:p-6"
      animate={{
        borderRadius: hovered ? cfg.hoverRadius : cfg.radius,
        x: hovered ? cfg.shift.x : 0,
        y: hovered ? cfg.shift.y : 0,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{cfg.label}</p>
      <p className="mt-2 text-base font-semibold text-slate-800">{preview.headline}</p>
      <code className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-sm font-medium text-teal-600">{preview.metric}</code>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">{preview.context}</p>
    </motion.button>
  );
}
