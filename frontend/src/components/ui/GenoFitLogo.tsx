type LogoVariant = "dark" | "light";

interface GenoFitLogoProps {
  variant?: LogoVariant;
  className?: string;
}

export function GenoFitLogo({ variant = "dark", className = "h-10 w-auto" }: GenoFitLogoProps) {
  const base = import.meta.env.BASE_URL;
  const src = variant === "dark" ? `${base}assets/genofit-logo.svg` : `${base}assets/genofit-logo-light.svg`;

  return (
    <img
      src={src}
      alt="GenoFit — Your Genes. Your Data. Your Edge."
      className={className}
      draggable={false}
    />
  );
}
