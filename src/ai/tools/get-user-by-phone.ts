import { z } from "zod";
import type { ToolExecutionOptions } from "ai";
import { getSubscriptionConnection } from "../../lib/subscription-database";
import { getProductionClusterDb } from "../../lib/production-database";
import { USER_DB, USER_COLLECTIONS, SUBSCRIPTION_COLLECTIONS as SC } from "../../constants/databases";
import { normalizePhoneVariants } from "./helpers";
import { ToolErrorCode } from "./errors";
import {
	fetchUserProfile,
	buildProfileResult,
	crossReferenceUserId,
} from "./user-profile";

const parameters = z.object({
	phone: z.string().describe("Customer phone number"),
});

async function execute(
	{ phone: rawPhone }: z.infer<typeof parameters>,
	_opts: ToolExecutionOptions,
) {
	const phone = rawPhone.trim();
	if (!phone) return { error: "Provide a phone number.", code: ToolErrorCode.INVALID_INPUT };

	const variants = normalizePhoneVariants(phone);
	if (!variants.length) return { error: "Invalid phone number format.", code: ToolErrorCode.INVALID_INPUT };

	const productDb = getProductionClusterDb(USER_DB);
	const subDb = getSubscriptionConnection()?.db;

	if (productDb) {
		const profile = await fetchUserProfile({ phone_number: { $in: variants } });

		if (profile) {
			const subUserId = await crossReferenceUserId(profile);
			return buildProfileResult(profile, subUserId);
		}
	}

	if (subDb) {
		const session = await subDb
			.collection(SC.CHECKOUT_SESSIONS)
			.findOne({ phone: { $in: variants } }, { sort: { createdAt: -1 } });
		if (session) {
			return {
				source: "mongo_checkoutsessions",
				phone,
				user_id: String(session.userId),
				email: (session.email as string) || null,
				name: (session.name as string) || null,
				message: "Found via checkout session phone match.",
			};
		}
	}

	return {
		error: `No user found for phone ${phone} (tried: ${variants.slice(0, 3).join(", ")}).`,
		code: ToolErrorCode.NOT_FOUND,
	};
}

export const getUserByPhone = {
	description: "Find a customer by phone number. Handles Pakistan format variations (03xx, +923xx, etc.).",
	parameters,
	execute,
};
