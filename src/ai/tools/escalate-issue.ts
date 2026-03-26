import { z } from "zod";
import type { ToolExecutionOptions } from "ai";
import crypto from "crypto";

const parameters = z.object({
	summary: z.string().describe("Brief description of the issue"),
	priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

async function execute(
	{ summary, priority }: z.infer<typeof parameters>,
	_opts: ToolExecutionOptions,
) {
	const ticketId = "ESC-" + crypto.randomBytes(3).toString("hex").toUpperCase();
	return {
		ticket_id: ticketId,
		summary,
		assigned_to: "dev-oncall@myco.io",
		priority,
	};
}

export const escalateIssue = {
	description: "Escalate a customer issue to the dev team.",
	parameters,
	execute,
};
