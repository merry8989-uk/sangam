import { notFound } from "next/navigation";
import { loadByShareToken } from "@/lib/driveAccess";
import { mediaUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

// A read-only view for a link share. No account required.
export default async function SharedItemPage({ params }: { params: { token: string } }) {
  const found = await loadByShareToken(params.token);
  if (!found) notFound();

  const { item, level } = found;
  const mime = item.mimeType || "";
  const url = item.storageKey ? mediaUrl(item.storageKey) : "";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs text-ink-500">Shared with you ({level === "EDIT" ? "can edit" : "can view"})</p>
      <h1 className="mt-1 text-2xl font-semibold">{item.name}</h1>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        {item.kind === "NOTE" || item.kind === "DOC" ? (
          <pre className="whitespace-pre-wrap text-sm">{item.content}</pre>
        ) : null}

        {item.kind === "SHEET" ? (
          <pre className="overflow-auto text-xs">{item.content}</pre>
        ) : null}

        {item.kind === "SLIDES" ? (
          <pre className="whitespace-pre-wrap text-xs">{item.content}</pre>
        ) : null}

        {item.kind === "LINK" && item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline">
            {item.sourceUrl}
          </a>
        ) : null}

        {item.kind === "FILE" ? (
          mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={url} className="max-h-[70vh] w-auto rounded-lg" />
          ) : mime.startsWith("video/") ? (
            <video src={url} controls className="w-full rounded-lg bg-black" />
          ) : mime.startsWith("audio/") ? (
            <audio src={url} controls className="w-full" />
          ) : (
            <a href={url} download className="text-brand-700 underline">
              Download the file
            </a>
          )
        ) : null}
      </div>
    </main>
  );
}
