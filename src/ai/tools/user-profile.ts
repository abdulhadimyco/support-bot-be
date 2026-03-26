import { escapeRegExp } from "lodash";
import { getSubscriptionConnection } from "../../lib/subscription-database";
import { getProductionClusterDb } from "../../lib/production-database";
import {
	USER_DB,
	USER_COLLECTIONS,
	SUBSCRIPTION_COLLECTIONS as SC,
} from "../../constants/databases";
import { toHexString, USER_PROJECTION } from "./helpers";
import { toolLogger } from "./errors";

export interface UserProfile {
	product_user_id: string | null;
	username: string | null;
	given_name: string | null;
	family_name: string | null;
	email: string | null;
	phone: string | null;
	phone_verified: boolean;
	email_verified: boolean;
	country: string | null;
	city: string | null;
	gender: string | null;
	group: string | null;
	deleted_on: string | null;
	created_at: string | null;
	updated_at: string | null;
}

export async function fetchUserProfile(
	query: Record<string, unknown>,
): Promise<UserProfile | null> {
	const db = getProductionClusterDb(USER_DB);
	if (!db) return null;

	try {
		const user = await db
			.collection(USER_COLLECTIONS.USERS)
			.findOne(query, { projection: USER_PROJECTION });
		if (!user) return null;

		return {
			product_user_id: toHexString(user._id),
			username: (user.preferred_username || user.username || null) as string | null,
			given_name: (user.given_name || null) as string | null,
			family_name: (user.family_name || null) as string | null,
			email: (user.email || null) as string | null,
			phone: (user.phone_number || null) as string | null,
			phone_verified: user.phone_number_verified === "true" || user.phone_number_verified === true,
			email_verified: user.email_verified === "true" || user.email_verified === true,
			country: (user.country || null) as string | null,
			city: (user.city || null) as string | null,
			gender: (user.gender || null) as string | null,
			group: (user.group || null) as string | null,
			deleted_on: (user.deletedOn || null) as string | null,
			created_at: user.createdAt ? new Date(user.createdAt as string).toISOString() : null,
			updated_at: user.updatedAt ? new Date(user.updatedAt as string).toISOString() : null,
		};
	} catch (e) {
		toolLogger.error({ err: e }, "fetchUserProfile failed");
		return null;
	}
}

export function buildProfileResult(profile: UserProfile, subUserId: string | null) {
	const name =
		[profile.given_name, profile.family_name].filter(Boolean).join(" ") ||
		profile.username;
	return {
		source: "mongo_users",
		user_id: subUserId || profile.product_user_id,
		product_user_id: profile.product_user_id,
		email: profile.email,
		name,
		username: profile.username,
		phone: profile.phone,
		phone_verified: profile.phone_verified,
		email_verified: profile.email_verified,
		country: profile.country,
		city: profile.city,
		gender: profile.gender,
		deleted_on: profile.deleted_on,
		created_at: profile.created_at,
		updated_at: profile.updated_at,
		message: "Use user_id with checkSubscription, getPaymentHistory, etc.",
	};
}

export function emailRegex(email: string) {
	return { $regex: new RegExp("^" + escapeRegExp(email) + "$", "i") };
}

export async function crossReferenceUserId(
	profile: UserProfile,
): Promise<string | null> {
	const db = getSubscriptionConnection()?.db;
	if (!db) return null;

	const productUserId = profile.product_user_id;
	if (!productUserId || !/^[a-fA-F0-9]{24}$/.test(productUserId)) return null;

	const checkouts = db.collection(SC.CHECKOUT_SESSIONS);
	const subscriptions = db.collection(SC.SUBSCRIPTIONS);

	const [sA, sB] = await Promise.all([
		checkouts.findOne({ userId: productUserId }, { sort: { createdAt: -1 } }),
		subscriptions.findOne({ userId: productUserId }, { sort: { createdAt: -1 } }),
	]);
	if (sA) return String(sA.userId);
	if (sB) return String(sB.userId);

	if (profile.username) {
		const sC = await checkouts.findOne({ username: profile.username }, { sort: { createdAt: -1 } });
		if (sC) return String(sC.userId);
	}

	return null;
}
