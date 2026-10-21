import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettingsOptional } from "@/lib/settings";
import { APP_VERSION } from "@/lib/appInfo";
import DiagnosticsPanel from "@/components/DiagnosticsPanel";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const settings = await getSettingsOptional(userId);

  // The support address lives in the environment, not in the code, so it is not
  // published with the source. Unset simply hides the email button.
  const supportEmail = (process.env.DIAGNOSTICS_SUPPORT_EMAIL ?? "").trim();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Diagnostics</h1>
      <p className="mb-6 text-sm text-ink-500">
        If something is not working, send us the technical detail instead of describing it. This page
        collects it, writes it in the format you pick, and opens your mail app with everything filled
        in.
      </p>
      <DiagnosticsPanel
        appVersion={APP_VERSION}
        supportEmail={supportEmail}
        enabled={settings?.diagnosticsEnabled !== false}
      />
    </main>
  );
}
