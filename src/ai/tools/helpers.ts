import dayjs from "dayjs";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Types } from "mongoose";
import config from "../../config/env";

export function toIso(v: unknown): string | null {
	if (!v) return null;
	const d = dayjs(v as string | number | Date);
	return d.isValid() ? d.toISOString() : null;
}

export function toHexString(v: unknown): string | null {
	if (!v) return null;
	if (typeof v === "string") return v;
	if (v instanceof Types.ObjectId) return v.toHexString();
	return String(v);
}

export function normalizePhoneVariants(raw: string): string[] {
	const input = String(raw || "").trim();
	if (!input) return [];

	const parsed = parsePhoneNumberFromString(input, "PK");
	if (!parsed || !parsed.isValid()) {
		const digits = input.replace(/[^0-9]/g, "");
		return digits.length >= 7 ? [digits] : [];
	}

	const e164 = parsed.number;
	const national = parsed.nationalNumber;
	const withZero = "0" + national;
	const withCountry = "92" + national;

	return [...new Set([e164, national, withZero, withCountry])];
}

export const USER_PROJECTION = {
	password: 0,
	sessionDetails: 0,
	subcodes: 0,
	availableCountries: 0,
};

export function jiraConfigured(): boolean {
	return Boolean(
		config.JIRA_BASE_URL && config.JIRA_EMAIL && config.JIRA_API_TOKEN,
	);
}

export function adfToPlainText(node: unknown, out: string[]): void {
	if (!node) return;
	if (typeof node === "string") {
		out.push(node);
		return;
	}
	if (typeof node !== "object") return;
	const n = node as Record<string, unknown>;
	if (n.type === "text") {
		out.push((n.text as string) || "");
		return;
	}
	if (Array.isArray(n.content)) {
		for (const child of n.content) adfToPlainText(child, out);
	}
}
