import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { restoreBackup } from "@/lib/backupRestoreRun";

const Body = z.object({
  fileId: z.string().min(1).max(300),
  provider: z.enum(["ZOHO", "GOOGLE"]).optional(),
  // Only needed when the file was encrypted with a passphrase we do not hold.
  passphrase: z.string().min(1).max(200).optional(),
  dryRun: z.boolean().optional()
});

// Read a backup back in. A dry run only reports what it would import.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const provider = parsed.data.provider ?? settings?.backupProvider ?? "ZOHO";
  if (provider === "TERABOX") {
    return NextResponse.json({ error: "Terabox cannot be read from. Pick Zoho or Google." }, { status: 400 });
  }

  const report = await restoreBackup(userId, {
    provider,
    fileId: parsed.data.fileId,
    passphrase: parsed.data.passphrase ?? null,
    dryRun: parsed.data.dryRun
  });

  return NextResponse.json(report, { status: report.ok ? 200 : 422 });
}
