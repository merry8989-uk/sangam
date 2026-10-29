import { NextResponse } from "next/server";

/**
 * What the latest Android build is.
 *
 * The app checks this on launch and offers to update itself. Kept deliberately
 * dumb: a version, a download URL and a note. The release is published by CI to
 * GitHub Releases; `APP_LATEST_VERSION` and `APP_APK_URL` are set on the server
 * from the tag that was just cut, so a deploy cannot point at the wrong file.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const version = (process.env.APP_LATEST_VERSION ?? "").trim();
  const url = (process.env.APP_APK_URL ?? "").trim();

  if (!version || !url) {
    // Nothing published yet. Not an error - the app should simply not offer an
    // update rather than offer a broken one.
    return NextResponse.json({ available: false, reason: "no release published" });
  }

  return NextResponse.json({
    available: true,
    version,
    url,
    sizeBytes: Number(process.env.APP_APK_SIZE ?? 0) || null,
    notes: (process.env.APP_RELEASE_NOTES ?? "").trim() || null,
    // A minimum the app refuses to run below, for a build that must be replaced.
    minimumVersion: (process.env.APP_MIN_VERSION ?? "").trim() || null,
    sha256: (process.env.APP_APK_SHA256 ?? "").trim() || null
  });
}
