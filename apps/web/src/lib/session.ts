/**
 * Temporary demo-only resume support (UF-05): remember the current learning
 * request in the browser so a reload returns to the last persisted step.
 * Not an authentication or persistence mechanism.
 */

const KEY = "auteur.demo.learningRequestId";

export function rememberRequestId(id: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, id);
  }
}

export function recallRequestId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(KEY);
}

export function forgetRequestId(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(KEY);
  }
}
