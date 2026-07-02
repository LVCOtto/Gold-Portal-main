type BrandedEmailSender = {
  from: string;
  name: string;
  roleTitle: string;
  contactEmail: string;
  accentColor: string;
  headerTitle: string;
};

type BrandedEmailInput = {
  subject: string;
  greeting?: string;
  bodyText: string;
  metaRows?: Array<{ label: string; value: string | null | undefined }>;
  sender: BrandedEmailSender;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderParagraphs(bodyText: string): string {
  const blocks = bodyText
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return "";
  }

  return blocks
    .map((block) => {
      const withBreaks = escapeHtml(block).replace(/\n/g, "<br />");
      return `<p style=\"margin:0 0 14px 0;color:#2f3842;font-size:15px;line-height:1.6;\">${withBreaks}</p>`;
    })
    .join("");
}

function renderMetaRows(rows: Array<{ label: string; value: string | null | undefined }>): string {
  const visible = rows.filter((row) => row.value && String(row.value).trim().length > 0);
  if (visible.length === 0) {
    return "";
  }

  const rowHtml = visible
    .map((row) => {
      const label = escapeHtml(row.label);
      const value = escapeHtml(String(row.value));
      return `<tr>
        <td style=\"padding:6px 0;color:#5a6773;font-size:13px;width:140px;vertical-align:top;\">${label}</td>
        <td style=\"padding:6px 0;color:#1f2a35;font-size:13px;font-weight:600;\">${value}</td>
      </tr>`;
    })
    .join("");

  return `<div style=\"margin:14px 0 18px 0;padding:12px 14px;border:1px solid #d6dde3;background:#f6f9fc;border-radius:8px;\">
    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\">${rowHtml}</table>
  </div>`;
}

export function renderBrandedOperationalEmail(input: BrandedEmailInput): string {
  const greeting = input.greeting?.trim();
  const greetingHtml = greeting
    ? `<p style=\"margin:0 0 14px 0;color:#2f3842;font-size:15px;line-height:1.6;\">${escapeHtml(greeting)}</p>`
    : "";

  const metaRowsHtml = renderMetaRows(input.metaRows || []);
  const paragraphsHtml = renderParagraphs(input.bodyText);
  const subject = escapeHtml(input.subject);

  return `<!doctype html>
<html>
  <body style=\"margin:0;padding:24px;background:#eff3f7;font-family:Segoe UI,Arial,sans-serif;\">
    <div style=\"max-width:760px;margin:0 auto;border:1px solid #d7dee5;border-radius:10px;overflow:hidden;background:#ffffff;\">
      <div style=\"background:${input.sender.accentColor};padding:18px 24px;\">
        <h1 style=\"margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:700;\">${escapeHtml(input.sender.headerTitle)}</h1>
      </div>

      <div style=\"padding:24px;\">
        <h2 style=\"margin:0 0 16px 0;color:#1f2a35;font-size:21px;line-height:1.35;\">${subject}</h2>
        ${greetingHtml}
        ${metaRowsHtml}
        ${paragraphsHtml}

        <div style=\"margin-top:22px;padding-top:16px;border-top:1px solid #d7dee5;\">
          <p style=\"margin:0;color:#106990;font-size:18px;font-weight:700;\">${escapeHtml(input.sender.name)}</p>
          <p style=\"margin:6px 0 0 0;color:#41505f;font-size:14px;\">${escapeHtml(input.sender.roleTitle)}</p>
          <p style=\"margin:8px 0 0 0;color:#41505f;font-size:13px;\">E: <a href=\"mailto:${escapeHtml(input.sender.contactEmail)}\" style=\"color:#106990;\">${escapeHtml(input.sender.contactEmail)}</a></p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export const WORKSHOP_UPDATE_SENDER: BrandedEmailSender = {
  from: process.env.WORKSHOP_UPDATES_FROM || "LVC Workshop Team <workshop@lvcuk.com>",
  name: "LVC Workshop Team",
  roleTitle: "Workshop Operations",
  contactEmail: "workshop@lvcuk.com",
  accentColor: "#1f7f9f",
  headerTitle: "Workshop Progress Update",
};

export const SERVICE_UPDATE_SENDER: BrandedEmailSender = {
  from: process.env.SERVICE_UPDATES_FROM || "LVC Service Team <service@lvcuk.com>",
  name: "LVC Service Team",
  roleTitle: "Service Operations",
  contactEmail: "service@lvcuk.com",
  accentColor: "#216f86",
  headerTitle: "Service Job Update",
};
