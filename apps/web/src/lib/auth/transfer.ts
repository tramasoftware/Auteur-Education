import { headers } from "next/headers";

import { apiUrl } from "@/lib/public-url";

export const ANON_TRANSFER_COOKIE = "auteur-anon-transfer";

export async function claimWithTokens(
  anonymousToken: string,
  permanentToken: string,
): Promise<boolean> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host")?.split(",")[0]?.trim() || headerList.get("host");
  const response = await fetch(apiUrl("/api/v1/auth/claim", host), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${permanentToken}`,
      "X-Anonymous-Authorization": `Bearer ${anonymousToken}`,
    },
    cache: "no-store",
    redirect: "manual",
  });
  return response.ok;
}
