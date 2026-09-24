import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline";
  busy?: boolean;
};

const base =
  "inline-flex cursor-pointer items-center justify-center px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50";

const variants = {
  primary: "rounded-xl bg-foreground text-surface hover:bg-foreground/85",
  secondary: "rounded-xl text-muted hover:text-foreground",
  outline:
    "rounded-xl border border-line bg-surface text-foreground hover:bg-[#eceae4]",
};

export const outlineButtonClass = `${base} ${variants.outline}`;

export function Button({
  variant = "primary",
  busy = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? "Working…" : children}
    </button>
  );
}
