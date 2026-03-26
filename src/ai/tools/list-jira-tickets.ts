import { z } from "zod";
import { clamp } from "lodash";
import config from "../../config/env";
import { jiraConfigured, adfToPlainText } from "./helpers";

const parameters = z.object({
	limit: z.number().min(1).max(20).optional().default(5),
	board_id: z.string().optional(),
});

async function execute(
	{ limit, board_id }: z.infer<typeof parameters>,

) {
	if (!jiraConfigured()) return { error: "Jira not configured." };

	const maxResults = clamp(limit ?? 5, 1, 20);
	const boardId = board_id || config.JIRA_BOARD_ID;
	const baseUrl = config.JIRA_BASE_URL!.replace(/\/$/, "");
	const auth = Buffer.from(`${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`).toString("base64");

	const jql = encodeURIComponent("ORDER BY created DESC");
	const apiUrl = `${baseUrl}/rest/agile/1.0/board/${encodeURIComponent(boardId)}/issue?maxResults=${maxResults}&startAt=0&fields=summary,description,status,created&jql=${jql}`;

	let res: Response;
	try {
		res = await fetch(apiUrl, {
			headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
		});
	} catch (e) {
		return { error: "Jira request failed: " + (e as Error).message };
	}

	if (!res.ok) return { error: `Jira API error ${res.status}: ${await res.text()}` };

	const data = await res.json();
	const issues = Array.isArray(data.issues) ? data.issues : [];

	return {
		source: "jira",
		board_id: boardId,
		count: issues.length,
		tickets: issues.map((issue: Record<string, unknown>) => {
			const fields = (issue.fields || {}) as Record<string, unknown>;
			let descText = "";
			if (typeof fields.description === "string") {
				descText = fields.description;
			} else if (fields.description) {
				const parts: string[] = [];
				adfToPlainText(fields.description, parts);
				descText = parts.join(" ").replace(/\s+/g, " ").trim();
			}
			return {
				issue_key: issue.key,
				summary: fields.summary || "",
				status: (fields.status as Record<string, unknown>)?.name || "",
				created_at: fields.created || null,
				description_preview: descText.slice(0, 240),
			};
		}),
	};
}

export const listJiraTickets = {
	description: "List newest tickets from the Jira support board.",
	parameters,
	execute,
};
