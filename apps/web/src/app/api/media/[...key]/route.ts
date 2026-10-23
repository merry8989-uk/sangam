import { NextResponse } from "next/server";
import { presignDownload } from "@/lib/s3";
import { getViewerId } from "@/lib/viewer";
import { canReadMediaKey } from "@/lib/mediaAccess";
import { logSecurity } from "@/lib/loggerServer";
import { withLogging } from "@/lib/withLogging";

/**
 * Serve a media key.
 *
 * This used to redirect anyone who had the key straight to the object. The keys
 * are not secret - every post response carries them - so a private post's media
 * was readable by anyone who had seen the post while it was public, or who had
 * the key from anywhere else.
 *
 * Now the key is resolved against the viewer and the same rules the post itself
 * obeys: the author always, a public post to anyone, a followers-only post to a
 * follower, a private post to nobody else. What is left is a short-lived
 * presigned URL rather than the public bucket base, so a leaked redirect is not
 * a permanent one.
 *
 * A denial is a 404, not a 403: confirming that a thing exists but is not yours
 * is itself a disclosure.
 */
export const GET = withLogging("media:key:get", async (req: Request, { params }: { params: { key: string[] } }) => {
  const key = (params.key ?? []).join("/");
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewerId = await getViewerId(req);
  const access = await canReadMediaKey(viewerId, key);

  if (!access.allowed) {
    // Worth a line: a run of denials on one key is someone hunting.
    logSecurity("media refused", {
      userId: viewerId,
      source: "media",
      metadata: { reason: access.reason }
    });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = await presignDownload(key);
    return NextResponse.redirect(url, 302);
  } catch {
    // The key is authorised but the object is not there.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
});
