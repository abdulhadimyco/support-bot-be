import { lookupUser } from "./lookup-user";
import { getUserByEmail } from "./get-user-by-email";
import { getUserByPhone } from "./get-user-by-phone";
import { getPaymentHistory } from "./get-payment-history";
import { mongoQuery } from "./mongo-query";
import { mongoAggregate } from "./mongo-aggregate";
import { pgQueryTool } from "./pg-query";
import { getJiraTicket } from "./get-jira-ticket";
import { listJiraTickets } from "./list-jira-tickets";
import { escalateIssue } from "./escalate-issue";

export const allTools = {
	lookupUser,
	getUserByEmail,
	getUserByPhone,
	getPaymentHistory,
	mongoQuery,
	mongoAggregate,
	pgQuery: pgQueryTool,
	getJiraTicket,
	listJiraTickets,
	escalateIssue,
};
