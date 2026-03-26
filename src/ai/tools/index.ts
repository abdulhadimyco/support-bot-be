import { tool } from "ai";
import { lookupUser } from "./lookup-user";
import { getUserByEmail } from "./get-user-by-email";
import { getUserByPhone } from "./get-user-by-phone";
import { getPaymentHistory } from "./get-payment-history";
import { pgQueryTool } from "./pg-query";
import { getJiraTicket } from "./get-jira-ticket";
import { listJiraTickets } from "./list-jira-tickets";
import { escalateIssue } from "./escalate-issue";
import { toolLogger } from "./errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = { description: string; parameters: any; execute: (...args: any[]) => Promise<any> };

function register(name: string, def: AnyTool) {
	const originalExecute = def.execute;

	return tool({
		description: def.description,
		inputSchema: def.parameters,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		execute: async (args: any, opts: any) => {
			toolLogger.info({ tool: name, input: args }, `[TOOL CALL] ${name}`);

			try {
				const result = await originalExecute(args, opts);

				const resultStr = JSON.stringify(result);
				const truncated =
					resultStr.length > 2000
						? resultStr.slice(0, 2000) + `... (${resultStr.length} chars total)`
						: resultStr;

				toolLogger.info(
					{ tool: name, outputLength: resultStr.length },
					`[TOOL RESULT] ${name}: ${truncated}`,
				);

				return result;
			} catch (e) {
				toolLogger.error(
					{ tool: name, input: args, err: e },
					`[TOOL ERROR] ${name} threw an exception`,
				);
				return {
					error: `Tool ${name} failed unexpectedly: ${(e as Error).message}`,
					code: "QUERY_FAILED",
				};
			}
		},
	});
}

export const specializedTools = {
	lookupUser: register("lookupUser", lookupUser),
	getUserByEmail: register("getUserByEmail", getUserByEmail),
	getUserByPhone: register("getUserByPhone", getUserByPhone),
	getPaymentHistory: register("getPaymentHistory", getPaymentHistory),
	pgQuery: register("pgQuery", pgQueryTool),
	getJiraTicket: register("getJiraTicket", getJiraTicket),
	listJiraTickets: register("listJiraTickets", listJiraTickets),
	escalateIssue: register("escalateIssue", escalateIssue),
};
