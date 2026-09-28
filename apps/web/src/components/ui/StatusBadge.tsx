type StatusBadgeProps = {
  label: string;
  tone?: "neutral" | "active" | "success" | "danger";
};

const tones = {
  neutral: "bg-[#eceae4] text-muted",
  active: "bg-[#eceae4] text-foreground",
  success: "bg-emerald-100 text-emerald-900",
  danger: "bg-red-100 text-red-900",
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
