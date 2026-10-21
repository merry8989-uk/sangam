/**
 * Sending a diagnostics report as an email, with the report attached.
 *
 * This is the only way to get a true attachment: a `mailto:` link and a Gmail
 * compose URL can both fill in the recipient, subject and body, but neither can
 * carry a file - the URI schemes have no field for one. So if the report must
 * arrive attached without the user doing anything, the server has to send it.
 *
 * Every provider here is called with plain `fetch`, so there is no mail
 * dependency to install and the request each one expects can be built and
 * tested on its own. The provider is chosen by configuration, not by code.
 *
 * One rule the caller must not break: the recipient is never taken from the
 * client. See the route for why.
 */

export const MAIL_PROVIDERS = ["resend", "sendgrid", "postmark", "brevo", "custom"] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

export type MailAttachment = {
  filename: string;
  /** Base64. Every provider below takes base64 for an attachment. */
  content: string;
  contentType: string;
};

export type MailInput = {
  to: string;
  from: string;
  subject: string;
  text: string;
  attachment: MailAttachment;
};

export type MailConfig = {
  provider: MailProvider;
  apiKey: string;
  from: string;
  /** Only used by `custom`, and by mailgun-style endpoints that carry it. */
  apiUrl?: string;
};

export type MailResult = { ok: boolean; provider: string; detail: string };

export function isMailProvider(v: unknown): v is MailProvider {
  return typeof v === "string" && (MAIL_PROVIDERS as readonly string[]).includes(v);
}

/**
 * Read the mail configuration out of the environment. Returns null when nothing
 * is configured, which the UI treats as "offer the other paths instead".
 */
export function mailConfig(): MailConfig | null {
  const provider = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = (process.env.EMAIL_API_KEY ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim();
  if (!isMailProvider(provider) || !apiKey || !from) return null;
  return { provider, apiKey, from, apiUrl: (process.env.EMAIL_API_URL ?? "").trim() || undefined };
}

export function mailerConfigured(): boolean {
  return mailConfig() !== null;
}

/** What the provider needs, in a shape that can be asserted in a test. */
export type BuiltRequest = { url: string; init: RequestInit };

/**
 * Build the HTTP request a provider expects.
 *
 * Pure: no network, no environment. Given the same input it always produces the
 * same request, which is what makes the per-provider shapes testable.
 */
export function buildRequest(provider: MailProvider, cfg: MailConfig, input: MailInput): BuiltRequest {
  const json = (body: unknown, headers: Record<string, string>): BuiltRequest => ({
    url: "",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    }
  });

  switch (provider) {
    case "resend": {
      const r = json(
        {
          from: input.from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          attachments: [{ filename: input.attachment.filename, content: input.attachment.content }]
        },
        { Authorization: `Bearer ${cfg.apiKey}` }
      );
      return { ...r, url: "https://api.resend.com/emails" };
    }

    case "sendgrid": {
      const r = json(
        {
          personalizations: [{ to: [{ email: input.to }] }],
          from: { email: input.from },
          subject: input.subject,
          content: [{ type: "text/plain", value: input.text }],
          attachments: [
            {
              content: input.attachment.content,
              filename: input.attachment.filename,
              type: input.attachment.contentType,
              disposition: "attachment"
            }
          ]
        },
        { Authorization: `Bearer ${cfg.apiKey}` }
      );
      return { ...r, url: "https://api.sendgrid.com/v3/mail/send" };
    }

    case "postmark": {
      const r = json(
        {
          From: input.from,
          To: input.to,
          Subject: input.subject,
          TextBody: input.text,
          Attachments: [
            {
              Name: input.attachment.filename,
              Content: input.attachment.content,
              ContentType: input.attachment.contentType
            }
          ]
        },
        { "X-Postmark-Server-Token": cfg.apiKey }
      );
      return { ...r, url: "https://api.postmarkapp.com/email" };
    }

    case "brevo": {
      const r = json(
        {
          sender: { email: input.from },
          to: [{ email: input.to }],
          subject: input.subject,
          textContent: input.text,
          attachment: [{ name: input.attachment.filename, content: input.attachment.content }]
        },
        { "api-key": cfg.apiKey }
      );
      return { ...r, url: "https://api.brevo.com/v3/smtp/email" };
    }

    case "custom": {
      // Anything else: a gateway, a self-hosted relay, an internal service. The
      // shape is fixed and documented so the other end knows what to expect.
      const r = json(
        {
          to: input.to,
          from: input.from,
          subject: input.subject,
          text: input.text,
          attachment: {
            filename: input.attachment.filename,
            content: input.attachment.content,
            contentType: input.attachment.contentType
          }
        },
        { Authorization: `Bearer ${cfg.apiKey}` }
      );
      return { ...r, url: cfg.apiUrl ?? "" };
    }

    default:
      return { url: "", init: { method: "POST" } };
  }
}

/** Send it. Best effort: the caller has already stored the report either way. */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const cfg = mailConfig();
  if (!cfg) return { ok: false, provider: "none", detail: "no mail provider configured" };

  const req = buildRequest(cfg.provider, cfg, input);
  if (!req.url) return { ok: false, provider: cfg.provider, detail: "no endpoint configured" };

  try {
    const res = await fetch(req.url, req.init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, provider: cfg.provider, detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true, provider: cfg.provider, detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      provider: cfg.provider,
      detail: err instanceof Error ? err.message : "send failed"
    };
  }
}

/** Base64 of a UTF-8 string, in Node or the browser. */
export function toBase64(text: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf8").toString("base64");
  // browser fallback
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
