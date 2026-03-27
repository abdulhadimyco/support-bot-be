import { z } from "zod";
import { Types } from "mongoose";
import { getSubscriptionConnection } from "../../lib/subscription-database";
import { toIso, toHexString } from "./helpers";
import { toolError, ToolErrorCode } from "./errors";
import { SUBSCRIPTION_COLLECTIONS as SC } from "../../constants/databases";

const parameters = z.object({
	user_id: z.union([z.string(), z.number()]).describe("Customer user ID"),
});

async function execute(params: z.infer<typeof parameters>) {
	const conn = getSubscriptionConnection();
	const db = conn?.db;
	if (!db) return toolError(ToolErrorCode.DB_UNAVAILABLE, "Subscription database not connected.", "checkSubscription");

	const userId = String(params.user_id);

	const subscriptions = await db
		.collection(SC.SUBSCRIPTIONS)
		.find({ userId })
		.sort({ createdAt: -1 })
		.toArray();

	if (!subscriptions.length) {
		return toolError(ToolErrorCode.NOT_FOUND, "No subscriptions found for this user.", "checkSubscription");
	}

	// Collect all licenseId values and fetch license documents
	const allLicenseIds = subscriptions
		.map((s) => toHexString(s.licenseId))
		.filter((id): id is string => !!id && /^[a-fA-F0-9]{24}$/.test(id));
	const uniqueLicenseIds = [...new Set(allLicenseIds)];

	const licenses = uniqueLicenseIds.length
		? await db
				.collection(SC.LICENSES)
				.find({ _id: { $in: uniqueLicenseIds.map((id) => new Types.ObjectId(id)) } })
				.toArray()
		: [];

	const licenseById = new Map<string, Record<string, unknown>>();
	for (const l of licenses) {
		const id = toHexString(l._id);
		if (id) licenseById.set(id, l as Record<string, unknown>);
	}

	// Fetch checkout sessions for plan/price details
	const checkouts = await db
		.collection(SC.CHECKOUT_SESSIONS)
		.find({ userId })
		.sort({ createdAt: -1 })
		.toArray();

	const checkoutByLicense = new Map<string, Record<string, unknown>>();
	for (const c of checkouts) {
		const key = toHexString(c.licenseId);
		if (key) checkoutByLicense.set(key, c as Record<string, unknown>);
	}

	// Map subscriptions to response shape
	const mapped = subscriptions.map((sub) => {
		const licenseId = toHexString(sub.licenseId);
		const license = licenseId ? licenseById.get(licenseId) || null : null;
		const licenseName = license
			? (license.name as string) || (license.label as string) || (license.title as string) || null
			: null;

		const checkout = licenseId ? checkoutByLicense.get(licenseId) || null : null;

		return {
			status: (sub.status as string) || "unknown",
			is_canceled: Boolean(sub.isCanceled),
			is_onetime: Boolean(sub.isOnetime),
			license_name: licenseName,
			expires_at: toIso(sub.expireAt),
			created_at: toIso(sub.createdAt),
			plan_name: checkout?.planName || null,
			price: checkout?.price || null,
			currency: checkout?.currency || null,
			is_completed: checkout ? Boolean(checkout.isCompleted) : null,
		};
	});

	const activeCount = mapped.filter(
		(s) => s.status === "active" && !s.is_canceled,
	).length;

	return {
		source: "mongo",
		user_id: userId,
		subscription_count: subscriptions.length,
		active_count: activeCount,
		inactive_count: subscriptions.length - activeCount,
		subscriptions: mapped,
	};
}

export const checkSubscription = {
	description: "Check subscription status and plan details for a customer by user_id.",
	parameters,
	execute,
};
