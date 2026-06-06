type LogoVariant = "dark" | "light";

interface GenoFitLogoProps {
  variant?: LogoVariant;
  className?: string;
}

export function GenoFitLogo({ variant = "dark", className = "h-10 w-auto" }: GenoFitLogoProps) {
  const src = variant === "dark" ? "/assets/genofit-logo.svg" : "/assets/genofit-logo-light.svg";

  return (
    <img
      src={src}
      alt="GenoFit — Your Genes. Your Data. Your Edge."
      className={className}
      draggable={false}
    />
  );
}
