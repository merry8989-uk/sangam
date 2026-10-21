/**
 * App identity, in one place.
 *
 * The version comes from APP_VERSION when the deployment sets it (Docker
 * build arg, CI, a release tag), and falls back to the package version. Having
 * it in one file means a diagnostics report, a health check and the UI cannot
 * disagree about which build is running.
 */

export const APP_NAME = "Sangam";

export const APP_VERSION = process.env.APP_VERSION || "0.1.0";

/** Short build label for a report: version plus the environment. */
export function buildLabel(): string {
  return `${APP_VERSION} (${process.env.NODE_ENV || "development"})`;
}
