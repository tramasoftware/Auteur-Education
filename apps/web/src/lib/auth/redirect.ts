/** Same rules as auteur_api.core.redirects.safe_internal_path. */

export function safeInternalPath(value: string | null, fallback = "/"): string {
  if (!value) {
    return fallback;
  }
  const candidate = value.trim();
  if (!isInternal(candidate)) {
    return fallback;
  }
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }
  if (decoded !== candidate && !isInternal(decoded)) {
    return fallback;
  }
  return candidate;
}

function isInternal(candidate: string): boolean {
  if (!candidate.startsWith("/")) {
    return false;
  }
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return false;
  }
  if (candidate.includes("\\") || candidate.includes("://")) {
    return false;
  }
  return true;
}
