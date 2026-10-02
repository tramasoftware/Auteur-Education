type BlueprintNavIconProps = {
  className?: string;
};

/** Outline parchment scroll (Draft Blueprint nav). */
export function BlueprintNavIcon({ className = "size-5 shrink-0" }: BlueprintNavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M4.5 6.25c0-1.25 1-2.25 2.25-2.25 1 0 1.85.65 2.15 1.55" />
      <path d="M8.9 5.55V5.35h7c1.25 0 2.25 1 2.25 2.25v8.25c0 1.25-1 2.25-2.25 2.25h-5.1c.2 1.35 1.35 2.25 2.75 2.05 1.2-.15 2.05-1.2 1.9-2.4H7.35c-1.25 0-2.25-1-2.25-2.25V6.35c0-.55.45-1 1-1h.65" />
    </svg>
  );
}
