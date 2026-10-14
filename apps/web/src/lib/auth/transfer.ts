export const ANON_TRANSFER_COOKIE = "auteur-anon-transfer";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function claimWithTokens(
  anonymousToken: string,
  permanentToken: string,
): Promise<boolean> {
  const response = await fetch(`${API_URL}/api/v1/auth/claim`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${permanentToken}`,
      "X-Anonymous-Authorization": `Bearer ${anonymousToken}`,
    },
    cache: "no-store",
  });
  return response.ok;
}
