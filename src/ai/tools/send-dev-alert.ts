import { z } from "zod";
import sgMail from "@sendgrid/mail";
import config from "../../config/env";
import { toolLogger } from "./errors";

const parameters = z.object({
	subject: z.string().describe("Brief subject line for the alert"),
	details: z.string().describe("Detailed description of the issue found"),
	severity: z
		.enum(["low", "medium", "high"])
		.default("medium")
		.optional()
		.describe("Alert severity"),
	customer_context: z
		.string()
		.optional()
		.describe(
			"Customer ID, email, or context that triggered this alert",
		),
	query_context: z
		.string()
		.optional()
		.describe("The query or tool call that revealed the issue"),
});

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
	high: { bg: "#dc2626", text: "#ffffff" },
	medium: { bg: "#eab308", text: "#1a1a1a" },
	low: { bg: "#3b82f6", text: "#ffffff" },
};

function buildHtml(params: z.infer<typeof parameters>): string {
	const severity = params.severity ?? "medium";
	const colors = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.medium;
	const timestamp = new Date().toISOString();

	let html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">

      <!-- Header -->
      <div style="padding:16px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;">
        <span style="display:inline-block;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:${colors.bg};color:${colors.text};">
          ${severity}
        </span>
        <span style="font-size:11px;color:#6b7280;">Dev Alert</span>
      </div>

      <!-- Subject -->
      <div style="padding:20px 24px 12px;">
        <h2 style="margin:0;font-size:18px;color:#111827;">${escapeHtml(params.subject)}</h2>
      </div>

      <!-- Details -->
      <div style="padding:0 24px 16px;">
        <h4 style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Details</h4>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(params.details)}</p>
      </div>`;

	if (params.customer_context) {
		html += `
      <!-- Customer Context -->
      <div style="padding:0 24px 16px;">
        <h4 style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Customer Context</h4>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(params.customer_context)}</p>
      </div>`;
	}

	if (params.query_context) {
		html += `
      <!-- Query Context -->
      <div style="padding:0 24px 16px;">
        <h4 style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Query Context</h4>
        <pre style="margin:0;padding:12px;background:#f3f4f6;border-radius:6px;font-size:13px;color:#374151;overflow-x:auto;white-space:pre-wrap;">${escapeHtml(params.query_context)}</pre>
      </div>`;
	}

	html += `
      <!-- Timestamp -->
      <div style="padding:0 24px 20px;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Timestamp: ${timestamp}</p>
      </div>

      <!-- Footer -->
      <div style="padding:12px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Sent by Sherlock Support Bot</p>
      </div>

    </div>
  </div>
</body>
</html>`;

	return html;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

async function execute(params: z.infer<typeof parameters>) {
	const severity = params.severity ?? "medium";

	if (!config.SENDGRID_API_KEY || !config.DEV_ALERT_TO_EMAIL) {
		toolLogger.warn(
			"SendGrid not configured — SENDGRID_API_KEY or DEV_ALERT_TO_EMAIL missing. Skipping dev alert email.",
		);
		return { sent: false, reason: "SendGrid not configured" };
	}

	sgMail.setApiKey(config.SENDGRID_API_KEY);

	const subjectLine = `[${severity.toUpperCase()}] ${params.subject}`;
	const html = buildHtml(params);

	try {
		await sgMail.send({
			to: config.DEV_ALERT_TO_EMAIL,
			from: config.SENDGRID_FROM_EMAIL,
			subject: subjectLine,
			html,
		});

		toolLogger.info(
			{ to: config.DEV_ALERT_TO_EMAIL, subject: subjectLine },
			"Dev alert email sent",
		);

		return {
			sent: true,
			to: config.DEV_ALERT_TO_EMAIL,
			subject: subjectLine,
		};
	} catch (err: unknown) {
		const message =
			err instanceof Error ? err.message : "Unknown SendGrid error";
		toolLogger.error({ err }, "Failed to send dev alert email");
		return { sent: false, reason: message };
	}
}

export const sendDevAlert = {
	description:
		"Send a dev alert email to the engineering team about a data issue, bug, or anomaly discovered during customer support. Use this when you notice something technically wrong (missing data, sync issues, unexpected states) that developers should investigate.",
	parameters,
	execute,
};
