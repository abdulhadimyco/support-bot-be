import dayjs from "dayjs";
import { escapeRegExp } from "lodash";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Types } from "mongoose";

export { escapeRegExp };

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

export function formatShort(d: Date): string {
	return dayjs(d).format("YYYY-MM-DD HH:mm");
}

export function normalizePhoneVariants(raw: string): string[] {
	const input = String(raw || "").trim();
	if (!input) return [];

	const parsed = parsePhoneNumberFromString(input, "PK");
	if (!parsed || !parsed.isValid()) {
		const digits = input.replace(/[^0-9]/g, "");
		return digits.length >= 7 ? [digits] : [];
	}

	const e164 = parsed.number; // +923001234567
	const national = parsed.nationalNumber; // 3001234567
	const withZero = "0" + national; // 03001234567
	const withCountry = "92" + national; // 923001234567

	return [...new Set([e164, national, withZero, withCountry])];
}
