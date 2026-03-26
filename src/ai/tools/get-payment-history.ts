import { z } from "zod";
import { round, groupBy, sumBy, mapValues } from "lodash";
import { Types } from "mongoose";
import { escapeRegExp } from "lodash";
import { getSubscriptionConnection } from "../../lib/subscription-database";
import { pgQuery, postgresEnabled } from "../../lib/payments-database";
import { toIso, toHexString } from "./helpers";
import { getUserByEmail } from "./get-user-by-email";
import { toolError, ToolErrorCode, toolLogger } from "./errors";
import {
	SUBSCRIPTION_COLLECTIONS as SC,
	PG_VENDORS,
} from "../../constants/databases";

const parameters = z.object({
	user_id: z.union([z.string(), z.number()]).optional().describe("Customer user ID"),
	email: z.string().optional().describe("Customer email (alternative to user_id)"),
});

function coalesce(obj: Record<string, unknown>, keys: string[]): unknown {
	for (const k of keys) {
		const v = obj[k];
		if (v !== undefined && v !== null && v !== "") return v;
	}
	return null;
}

function resolveStatus(statusVal: unknown, receipt: Record<string, unknown>, checkout: Record<string, unknown> | null): string {
	const s = statusVal ? String(statusVal).toLowerCase() : "";
	const ok = ["completed", "paid", "succeeded", "success", "confirmed", "done", "settled", "captured"];
	const fail = ["failed", "refunded", "expired", "cancelled", "canceled", "reversed"];
	if (s && ok.includes(s)) return "completed";
	if (s && fail.includes(s)) return s.replace("cancelled", "canceled");

	const isComp = (v: unknown) => v === true || v === 1 || String(v).toLowerCase() === "true";
	if (isComp(coalesce(receipt, ["isCompleted"]))) return "completed";
	if (checkout && isComp(coalesce(checkout, ["isCompleted"]))) return "completed";
	if (s) return s;
	return "unknown";
}

function licenseName(lic: Record<string, unknown> | null): string | null {
	if (!lic) return null;
	return (lic.identifier || lic.name || lic.title || lic.displayName || lic.licenseName || lic.productName || null) as string | null;
}

async function fetchPgTransactions(userId: string, email: string | null) {
	if (!postgresEnabled()) return [];

	const uid = /^[a-f0-9]{24}$/.test(userId) ? userId : null;
	const rows: Record<string, unknown>[] = [];

	if (uid) {
		const res = await pgQuery(
			`SELECT t."publicId", t."userId", t."paymentMethod", t."status", t."amount", t."currency", t."createdAt",
			        c."reference" as checkout_reference
			 FROM transactions t
			 LEFT JOIN checkouts c ON c."publicId"::text = t."checkoutId"::text
			 WHERE t."userId" = $1 AND t."vendorId" = $2
			 ORDER BY t."createdAt" DESC LIMIT 200`,
			[uid, PG_VENDORS.PKR],
		);
		if (res?.rows) rows.push(...res.rows);
	}

	if (email) {
		const userRes = await pgQuery(`SELECT "id" FROM users WHERE LOWER("email") = LOWER($1) LIMIT 1`, [email]);
		const pgUserId = userRes?.rows?.[0]?.id;
		if (pgUserId) {
			const stripeRes = await pgQuery(
				`SELECT t."publicId", t."userId", t."paymentMethod", t."status", t."amount", t."currency", t."createdAt",
				        c."reference" as checkout_reference
				 FROM transactions t
				 LEFT JOIN checkouts c ON c."publicId"::text = t."checkoutId"::text
				 WHERE t."userId"::text = $1 AND t."paymentMethod" = 'stripe'
				 ORDER BY t."createdAt" DESC LIMIT 100`,
				[String(pgUserId)],
			);
			if (stripeRes?.rows) rows.push(...stripeRes.rows);
		}
	}

	return rows.map((r) => ({
		source_db: "postgres" as const,
		pg_transaction_id: r.publicId || r.id,
		created_at: toIso(r.createdAt),
		amount: Number(r.amount || 0),
		currency: (String(r.currency || "").toUpperCase()) || null,
		status: String(r.status || "").toLowerCase(),
		payment_gateway: (r.paymentMethod as string) || null,
		checkout_reference: r.checkout_reference ? toHexString(r.checkout_reference) : null,
	}));
}

async function execute(
	params: z.infer<typeof parameters>,
) {
	const conn = getSubscriptionConnection();
	const db = conn?.db;
	if (!db) return toolError(ToolErrorCode.DB_UNAVAILABLE, "Subscription database not connected.", "getPaymentHistory");

	let userId: string;
	let email: string | null = null;
	let name: string | null = null;

	if (params.user_id) {
		userId = String(params.user_id);
		const latest = await db.collection(SC.CHECKOUT_SESSIONS).findOne(
			{ $or: [{ userId }, { user_id: userId }] },
			{ sort: { createdAt: -1 } },
		);
		email = (latest?.email as string) || null;
		name = (latest?.name as string) || null;
	} else if (params.email) {
		const resolved = await getUserByEmail.execute({ email: params.email });
		if ("error" in resolved) return resolved;
		userId = String((resolved as Record<string, unknown>).user_id);
		email = (resolved as Record<string, unknown>).email as string || params.email;
		name = (resolved as Record<string, unknown>).name as string || null;
	} else {
		return toolError(ToolErrorCode.INVALID_INPUT, "Provide user_id or email.", "getPaymentHistory");
	}

	const emailRegex = email ? { $regex: new RegExp("^" + escapeRegExp(email) + "$", "i") } : null;
	const userOr: Record<string, unknown>[] = [{ userId }, { user_id: userId }];
	if (emailRegex) userOr.push({ email: emailRegex });

	const [checkouts, subscriptions] = await Promise.all([
		db.collection(SC.CHECKOUT_SESSIONS).find({ $or: userOr }).sort({ createdAt: -1 }).limit(500).toArray(),
		db.collection(SC.SUBSCRIPTIONS).find({ userId }).sort({ createdAt: -1 }).limit(200).toArray(),
	]);

	const sessionIds = checkouts.map((c) => String(c.sessionId || c._id)).filter(Boolean);
	const receiptOr: Record<string, unknown>[] = [{ userId }, { user_id: userId }];
	if (emailRegex) receiptOr.push({ email: emailRegex });
	if (sessionIds.length) receiptOr.push({ sessionId: { $in: sessionIds } });

	const receipts = await db.collection(SC.RECEIPTS).find({ $or: receiptOr }).sort({ createdAt: -1 }).limit(500).toArray();

	if (!receipts.length && !subscriptions.length) {
		return toolError(ToolErrorCode.NOT_FOUND, "No payment history found for this user.", "getPaymentHistory");
	}

	const allLicenseIds = [...receipts, ...checkouts, ...subscriptions]
		.map((r) => toHexString(r.licenseId || r.license_id))
		.filter((id): id is string => !!id && /^[a-fA-F0-9]{24}$/.test(id));
	const uniqueLicenseIds = [...new Set(allLicenseIds)];

	const licenses = uniqueLicenseIds.length
		? await db.collection(SC.LICENSES).find({ _id: { $in: uniqueLicenseIds.map((id) => new Types.ObjectId(id)) } }).toArray()
		: [];
	const licenseById = new Map<string, Record<string, unknown>>();
	for (const l of licenses) {
		const id = toHexString(l._id);
		if (id) licenseById.set(id, l as Record<string, unknown>);
	}

	const checkoutBySession = new Map<string, Record<string, unknown>>();
	for (const c of checkouts) {
		const key = String(c.sessionId || c._id);
		if (key) checkoutBySession.set(key, c as Record<string, unknown>);
	}
	const checkoutByLicense = new Map<string, Record<string, unknown>>();
	for (const c of checkouts) {
		const key = String(c.licenseId || "");
		if (key) checkoutByLicense.set(key, c as Record<string, unknown>);
	}

	const payments = receipts.map((receipt) => {
		const r = receipt as unknown as Record<string, unknown>;
		const sessionId = coalesce(r, ["sessionId", "session_id"]);
		const licenseId = coalesce(r, ["licenseId", "license_id"]);
		const checkout: Record<string, unknown> | null =
			(sessionId ? checkoutBySession.get(String(sessionId)) : null) ||
			(licenseId ? checkoutByLicense.get(String(licenseId)) : null) ||
			null;
		const resolvedLicenseId = toHexString(licenseId || (checkout ? coalesce(checkout, ["licenseId"]) : null));
		const license = resolvedLicenseId ? licenseById.get(resolvedLicenseId) || null : null;

		const amount = coalesce(r, ["amountPaid", "amount", "price", "paidAmount", "totalAmount", "total"]);
		const amountNum = Number(amount || 0) || 0;

		return {
			receipt_id: toHexString(r._id),
			created_at: toIso(coalesce(r, ["date", "createdAt", "created_at", "paidAt"])),
			amount: amountNum,
			currency: ((coalesce(r, ["currency"]) || (checkout ? coalesce(checkout, ["currency"]) : null)) as string) || null,
			payment_gateway: ((coalesce(r, ["paymentGateway", "gateway", "payment_method"]) || (checkout ? coalesce(checkout, ["paymentGateway"]) : null)) as string) || null,
			status: resolveStatus(coalesce(r, ["status", "paymentStatus"]), r, checkout),
			license_name: licenseName(license),
			license_id: resolvedLicenseId,
			plan_name: checkout ? ((coalesce(checkout, ["planName"]) as string) || null) : null,
			is_completed: resolveStatus(coalesce(r, ["status"]), r, checkout) === "completed",
			source_db: "mongo" as string,
			pg_transaction_id: null as string | null,
		};
	});

	let pgCount = 0;
	if (postgresEnabled()) {
		try {
			const pgRows = await fetchPgTransactions(userId, email);
			pgCount = pgRows.length;
			const paymentBySession = new Map<string, (typeof payments)[number]>();
			for (const p of payments) {
				if (p.receipt_id) paymentBySession.set(p.receipt_id, p);
			}

			for (const pg of pgRows) {
				const ref = pg.checkout_reference?.toLowerCase();
				const existing = ref ? paymentBySession.get(ref) : null;
				if (existing) {
					existing.source_db = "mongo+postgres";
					existing.pg_transaction_id = String(pg.pg_transaction_id);
					if (pg.status) existing.status = pg.status;
					if (pg.payment_gateway) existing.payment_gateway = pg.payment_gateway;
				} else {
					payments.push({
						receipt_id: null,
						created_at: pg.created_at,
						amount: pg.amount,
						currency: pg.currency,
						payment_gateway: pg.payment_gateway,
						status: pg.status,
						license_name: null,
						license_id: null,
						plan_name: null,
						is_completed: pg.status === "completed",
						source_db: "postgres",
						pg_transaction_id: String(pg.pg_transaction_id),
					});
				}
			}
		} catch (e) {
			toolLogger.error({ err: e }, "PostgreSQL merge failed");
		}
	}

	const totalsByCurrency = mapValues(
		groupBy(payments, (p) => (p.currency || "unknown").toUpperCase()),
		(group) => round(sumBy(group, "amount"), 2),
	);

	const byLicense = groupBy(payments, (p) => p.license_id || "unattributed");
	const licenseTimelines = Object.entries(byLicense).map(([licId, group]) => ({
		license_id: licId === "unattributed" ? null : licId,
		license_name: group[0]?.license_name || null,
		payment_count: group.length,
		totals_by_currency: mapValues(
			groupBy(group, (p) => (p.currency || "unknown").toUpperCase()),
			(g) => round(sumBy(g, "amount"), 2),
		),
		payments: group,
	}));

	return {
		source: pgCount ? "mongo+postgres" : "mongo",
		postgres_transactions_count: pgCount,
		user_id: userId,
		email,
		name,
		payment_count: payments.length,
		totals_by_currency: totalsByCurrency,
		payments,
		license_timelines: licenseTimelines,
		summary: {
			latest_payment_at: payments[0]?.created_at || null,
			latest_payment_status: payments[0]?.status || null,
		},
	};
}

export const getPaymentHistory = {
	description: "Full payment history across all plans for a customer.",
	parameters,
	execute,
};
