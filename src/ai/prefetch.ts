import { getUserByEmail } from "./tools/get-user-by-email";
import { getUserByPhone } from "./tools/get-user-by-phone";
import { mongoQuery } from "./tools/mongo-query";
import { toolLogger } from "./tools/errors";
import {
	SUBSCRIPTION_DB,
	SUBSCRIPTION_COLLECTIONS as SC,
} from "../constants/databases";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /\+?\d[\d\s\-]{8,15}\d/;
const PREFETCH_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	return Promise.race([
		promise,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
	]);
}

export async function autoPrefetch(userText: string): Promise<{
	context: string | null;
	userId: string | null;
}> {
	const emailMatch = userText.match(EMAIL_RE);
	const phoneMatch = userText.match(PHONE_RE);

	if (!emailMatch && !phoneMatch) return { context: null, userId: null };

	const lookupPromise: Promise<Record<string, unknown>> = emailMatch
		? (getUserByEmail.execute({ email: emailMatch[0] }) as Promise<Record<string, unknown>>)
		: (getUserByPhone.execute({ phone: phoneMatch![0] }) as Promise<Record<string, unknown>>);

	const userResult = await withTimeout(lookupPromise, PREFETCH_TIMEOUT_MS);

	if (!userResult || "error" in userResult) {
		return { context: null, userId: null };
	}

	const userId = String(userResult.user_id);
	const parts: string[] = [];
	parts.push(`Customer: ${JSON.stringify(userResult)}`);

	const [subResult, payResult] = await Promise.allSettled([
		mongoQuery.execute({
			database: SUBSCRIPTION_DB,
			collection: SC.SUBSCRIPTIONS,
			filter: { userId },
			sort: { createdAt: -1 },
			limit: 10,
		}),
		mongoQuery.execute({
			database: SUBSCRIPTION_DB,
			collection: SC.CHECKOUT_SESSIONS,
			filter: { userId },
			sort: { createdAt: -1 },
			limit: 10,
		}),
	]);

	if (subResult.status === "fulfilled") {
		parts.push(`Subscriptions: ${JSON.stringify(subResult.value)}`);
	}
	if (payResult.status === "fulfilled") {
		parts.push(`Recent checkouts: ${JSON.stringify(payResult.value)}`);
	}

	toolLogger.info(
		{ userId, email: emailMatch?.[0], phone: phoneMatch?.[0] },
		"Prefetch complete",
	);

	return { context: parts.join("\n\n"), userId };
}
