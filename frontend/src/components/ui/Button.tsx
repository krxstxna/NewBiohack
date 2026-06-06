import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  const base =
    "rounded-full px-6 py-2.5 transition-all duration-200 ease-out font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-emerald-500 text-white hover:-translate-y-0.5 hover:shadow-md"
      : "border border-slate-200 text-slate-700 hover:bg-slate-100 bg-white/70 backdrop-blur-md";

  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}
