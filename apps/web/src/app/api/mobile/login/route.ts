import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { issueMobileToken } from "@/lib/mobileAuth";
import { withLogging, clientIp } from "@/lib/withLogging";
import { logActivity, logSecurity, logApp } from "@/lib/loggerServer";

const Body = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

// Guessing a password is a numbers game. Ten tries per quarter hour, per
// address and account, makes it a losing one - and the counter is on the pair,
// so one attacker cannot lock out an account by trying from elsewhere.
const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 900;

/**
 * Sign in from the Android app and receive a Bearer token.
 *
 * The response is deliberately the same for "no such account" and "wrong
 * password", so the endpoint cannot be used to find out which addresses are
 * registered. The log is not: an operator looking into a run of failures needs
 * to tell those two apart, and a log is not public.
 */
export const POST = withLogging("auth:login", async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    logSecurity("login rejected: malformed request", { source: "auth:login", metadata: { ip: clientIp(req) } });
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const ip = clientIp(req);
  const attemptKey = `login:${ip}:${email.toLowerCase()}`;

  let attempts = 0;
  try {
    attempts = await redis.incr(attemptKey);
    if (attempts === 1) await redis.expire(attemptKey, WINDOW_SECONDS);
  } catch {
    // If the cache is down, let the attempt through rather than lock everyone
    // out of their own account.
  }

  if (attempts > MAX_ATTEMPTS) {
    logSecurity("login blocked: too many attempts", {
      source: "auth:login",
      metadata: { ip, attempts, windowSeconds: WINDOW_SECONDS }
    });
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(WINDOW_SECONDS) } }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true, displayName: true, avatarUrl: true, passwordHash: true, code: true }
  });

  // The same answer either way, and a failed attempt still costs the attacker
  // the work of a bcrypt comparison.
  const hash = user?.passwordHash ?? "$2a$12$0000000000000000000000000000000000000000000000000000";
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) {
    logSecurity(user ? "login failed: wrong password" : "login failed: no such account", {
      source: "auth:login",
      metadata: { ip, attempts }
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  try {
    await redis.del(attemptKey);
  } catch {
    /* best effort */
  }

  logActivity("signed in", { actorCode: user.code, userId: user.id, metadata: { ip } });
  logApp("mobile token issued", { userId: user.id });

  return NextResponse.json({
    token: issueMobileToken(user.id),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl
    }
  });
});
