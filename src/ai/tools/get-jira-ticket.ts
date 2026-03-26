import { z } from "zod";
import config from "../../config/env";
import { jiraConfigured, adfToPlainText } from "./helpers";

const parameters = z.object({
	url: z.string().optional().describe("Jira ticket URL"),
	issue_key: z.string().optional().describe("Jira issue key like MCSB-123"),
});

function parseIssueKey(urlOrKey: string): string | null {
	const match = urlOrKey.match(/\b([A-Za-z][A-Za-z0-9]*-\d+)\b/);
	return match ? match[1] : null;
}

async function execute(
	params: z.infer<typeof parameters>,

) {
	if (!jiraConfigured()) return { error: "Jira not configured." };

	const input = params.url || params.issue_key || "";
	const issueKey = parseIssueKey(input);
	if (!issueKey) return { error: "Could not parse Jira issue key. Provide a URL or key like MCSB-123." };

	const baseUrl = config.JIRA_BASE_URL!.replace(/\/$/, "");
	const auth = Buffer.from(`${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`).toString("base64");

	const apiUrl = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,description,status`;

	let res: Response;
	try {
		res = await fetch(apiUrl, {
			headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
		});
	} catch (e) {
		return { error: "Jira request failed: " + (e as Error).message };
	}

	if (!res.ok) {
		if (res.status === 404) return { error: `Jira issue not found: ${issueKey}` };
		return { error: `Jira API error ${res.status}: ${await res.text()}` };
	}

	const data = await res.json();
	const fields = data.fields || {};

	let descText = "";
	if (typeof fields.description === "string") {
		descText = fields.description;
	} else if (fields.description) {
		const parts: string[] = [];
		adfToPlainText(fields.description, parts);
		descText = parts.join(" ").replace(/\s+/g, " ").trim();
	}

	return {
		source: "jira",
		issue_key: issueKey,
		summary: fields.summary || "",
		status: fields.status?.name || "",
		description: descText.slice(0, 2000),
	};
}

export const getJiraTicket = {
	description: "Fetch a Jira support ticket by URL or issue key (e.g. MCSB-123).",
	parameters,
	execute,
};
