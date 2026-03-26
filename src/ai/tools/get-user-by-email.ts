import { z } from "zod";
import { Types } from "mongoose";
import { getSubscriptionConnection } from "../../lib/subscription-database";
import { SUBSCRIPTION_COLLECTIONS as SC } from "../../constants/databases";
import { ToolErrorCode } from "./errors";
import {
	fetchUserProfile,
	buildProfileResult,
	emailRegex,
	crossReferenceUserId,
} from "./user-profile";

const parameters = z.object({
	email: z.string().describe("Customer email address"),
});

async function execute(
	{ email: rawEmail }: z.infer<typeof parameters>,

) {
	const email = rawEmail.trim();
	if (!email) return { error: "Provide an email address.", code: ToolErrorCode.INVALID_INPUT };

	const subDb = getSubscriptionConnection()?.db;

	const profile = await fetchUserProfile({ email: emailRegex(email) });

	const session = subDb
		? await subDb.collection(SC.CHECKOUT_SESSIONS).findOne(
				{ email: emailRegex(email) },
				{ sort: { createdAt: -1 } },
			)
		: null;

	let subUserId = session ? String(session.userId) : null;

	if (profile) {
		if (!profile.email) profile.email = email;
		if (!subUserId) subUserId = await crossReferenceUserId(profile);
		return buildProfileResult(profile, subUserId);
	}

	if (session) {
		return {
			source: "mongo_checkoutsessions",
			email: (session.email as string) || email,
			user_id: subUserId,
			name: (session.name as string) || null,
			message: "Use this user_id with checkSubscription for subscription details.",
		};
	}

	if (subUserId && /^[a-fA-F0-9]{24}$/.test(subUserId)) {
		const fallback = await fetchUserProfile({ _id: new Types.ObjectId(subUserId) });
		if (fallback) {
			if (!fallback.email) fallback.email = email;
			return buildProfileResult(fallback, subUserId);
		}
	}

	return { error: "No user found for this email.", code: ToolErrorCode.NOT_FOUND };
}

export const getUserByEmail = {
	description: "Find a customer by email address. Returns user profile and user_id for other tools.",
	parameters,
	execute,
};
