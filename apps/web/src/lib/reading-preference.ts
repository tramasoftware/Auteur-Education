export const TEXT_SIZES = [
  { id: "small", label: "Small", scale: 0.93 },
  { id: "standard", label: "Standard", scale: 1 },
  { id: "large", label: "Large", scale: 1.14 },
  // A step above large, and a little smaller than the previous 1.3 preview.
  { id: "extra_large", label: "Extra large", scale: 1.26 },
] as const;

export type TextSizeId = (typeof TEXT_SIZES)[number]["id"];

/** Lesson body in the module desk (`.body p`) is 15px. Standard leaves it there. */
export const LESSON_BODY_PX = 15;

export const TEXT_SIZE_COOKIE = "auteur-text-size";
export const TEXT_SIZE_STORAGE_KEY = "auteur-text-size";

const TEXT_SIZE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTextSize(value: string | null | undefined): value is TextSizeId {
  return TEXT_SIZES.some((item) => item.id === value);
}

export function textSizeOrStandard(value: string | null | undefined): TextSizeId {
  return isTextSize(value) ? value : "standard";
}

export function textSizeScale(value: string | null | undefined): number {
  const id = textSizeOrStandard(value);
  return TEXT_SIZES.find((item) => item.id === id)?.scale ?? 1;
}

export function textSizeCookieOptions() {
  return {
    path: "/",
    maxAge: TEXT_SIZE_MAX_AGE,
    sameSite: "lax" as const,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  };
}

export function assignTextSizeCookie(
  response: {
    cookies: {
      set: (
        name: string,
        value: string,
        options: ReturnType<typeof textSizeCookieOptions>,
      ) => void;
    };
  },
  textSize: string | null,
) {
  if (!textSize) {
    return;
  }
  response.cookies.set(TEXT_SIZE_COOKIE, textSizeOrStandard(textSize), textSizeCookieOptions());
}

export function applyReadingScale(value: string | null | undefined) {
  if (typeof document === "undefined") {
    return;
  }
  const id = textSizeOrStandard(value);
  document.documentElement.dataset.textSize = id;
  document.documentElement.style.setProperty("--ft", String(textSizeScale(id)));
}

function writeClientCookie(id: TextSizeId | "") {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = id ? TEXT_SIZE_MAX_AGE : 0;
  document.cookie = `${TEXT_SIZE_COOKIE}=${id}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/** Persist the signed-in member's size in the cookie and local storage, and apply it. */
export function rememberReadingPreference(value: string | null | undefined) {
  const id = textSizeOrStandard(value);
  applyReadingScale(id);
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, id);
  } catch {
    // Private browsing can block storage. The cookie still carries the size.
  }
  writeClientCookie(id);
}

export function clearReadingPreference() {
  applyReadingScale("standard");
  try {
    window.localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
  } catch {
    // Ignore storage failures on logout.
  }
  writeClientCookie("");
}
