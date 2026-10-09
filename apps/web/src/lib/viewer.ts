import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { verifyMobileToken } from "./mobileAuth";

// Resolve the signed-in user from either a web session cookie (NextAuth) or a
// mobile Bearer token. Every API route uses this so both clients work.
export async function getViewerId(req?: Request): Promise<string | null> {
  if (req) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth.startsWith("Bearer ")) {
      const id = verifyMobileToken(auth.slice(7).trim());
      if (id) return id;
    }
  }
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}
