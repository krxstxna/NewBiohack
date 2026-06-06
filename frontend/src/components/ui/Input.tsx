import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-2xl px-4 py-3 bg-white/90 ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 shadow-sm outline-none w-full text-slate-800 placeholder:text-slate-400 transition-all duration-200 ${className}`}
      {...props}
    />
  );
}
