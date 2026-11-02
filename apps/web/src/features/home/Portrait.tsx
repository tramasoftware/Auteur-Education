export function Portrait({ src, alt = "" }: { src?: string | null; alt?: string }) {
  if (src) {
    return <img src={src} alt={alt} />;
  }
  return (
    <svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="64" height="64" fill="#d9d4cf" />
      <circle cx="32" cy="24" r="15" fill="#8d8680" />
      <path d="M4 64c2-18 14-26 28-26s26 8 28 26H4Z" fill="#8d8680" />
    </svg>
  );
}
