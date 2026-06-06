import { useMemo, useState } from "react";

type LogoVariant = "dark" | "light";

interface GenoFitLogoProps {
  variant?: LogoVariant;
  className?: string;
}

declare const __BUILD_TIMESTAMP__: string | undefined;

function logoUrls(base: string, variant: LogoVariant) {
  const bust =
    typeof __BUILD_TIMESTAMP__ !== "undefined" ? encodeURIComponent(__BUILD_TIMESTAMP__) : String(Date.now());
  const stem = variant === "dark" ? "genofit-logo" : "genofit-logo-light";
  const names = [`${stem}.png`, `${stem}.svg`, `${stem}.webp`, `${stem}.jpg`];
  return names.map((name) => `${base}assets/${name}?v=${bust}`);
}

export function GenoFitLogo({ variant = "dark", className = "h-10 w-auto" }: GenoFitLogoProps) {
  const base = import.meta.env.BASE_URL;
  const candidates = useMemo(() => logoUrls(base, variant), [base, variant]);
  const [index, setIndex] = useState(0);

  return (
    <img
      src={candidates[index]}
      alt="GenoFit — Your Genes. Your Data. Your Edge."
      className={className}
      draggable={false}
      onError={() => {
        setIndex((current) => (current < candidates.length - 1 ? current + 1 : current));
      }}
    />
  );
}
