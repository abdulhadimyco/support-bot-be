import { getUserByEmail } from "./tools/get-user-by-email";
import { getUserByPhone } from "./tools/get-user-by-phone";
import { getSubscriptionConnection } from "../lib/subscription-database";
import { SUBSCRIPTION_COLLECTIONS as SC } from "../constants/databases";
import { toolLogger } from "./tools/errors";

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

	// Direct DB queries for speed (MCP adds process overhead)
	const db = getSubscriptionConnection()?.db;
	if (db) {
		const [subs, checkouts] = await Promise.allSettled([
			db
				.collection(SC.SUBSCRIPTIONS)
				.find({ userId })
				.sort({ createdAt: -1 })
				.limit(10)
				.toArray(),
			db
				.collection(SC.CHECKOUT_SESSIONS)
				.find({ userId })
				.sort({ createdAt: -1 })
				.limit(10)
				.toArray(),
		]);

		if (subs.status === "fulfilled" && subs.value.length) {
			parts.push(`Subscriptions: ${JSON.stringify(subs.value)}`);
		}
		if (checkouts.status === "fulfilled" && checkouts.value.length) {
			parts.push(`Recent checkouts: ${JSON.stringify(checkouts.value)}`);
		}
	}

	toolLogger.info(
		{ userId, email: emailMatch?.[0], phone: phoneMatch?.[0] },
		"Prefetch complete",
	);

	return { context: parts.join("\n\n"), userId };
}
