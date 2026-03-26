import pino from "pino";
import type { Types } from "mongoose";
import { getToolErrorModel } from "../../db/models";

export enum ToolErrorCode {
	DB_UNAVAILABLE = "DB_UNAVAILABLE",
	ACCESS_DENIED = "ACCESS_DENIED",
	NOT_FOUND = "NOT_FOUND",
	INVALID_INPUT = "INVALID_INPUT",
	QUERY_FAILED = "QUERY_FAILED",
	EXTERNAL_API_ERROR = "EXTERNAL_API_ERROR",
	BLOCKED = "BLOCKED",
}

export interface ToolError {
	error: string;
	code: ToolErrorCode;
}

export const toolLogger = pino({
	name: "c3pa-tools",
	level: process.env.LOG_LEVEL || "info",
	transport:
		process.env.NODE_ENV === "development"
			? {
					target: "pino-pretty",
					options: { colorize: true, ignore: "pid,hostname" },
				}
			: undefined,
});

export function toolError(
	code: ToolErrorCode,
	message: string,
	toolName?: string,
	params?: Record<string, unknown>,
): ToolError {
	persistToolError(toolName || "unknown", code, message, params || null);
	return { error: message, code };
}

export function persistToolError(
	toolName: string,
	errorCode: string,
	errorMessage: string,
	params: Record<string, unknown> | null,
	threadId?: Types.ObjectId,
) {
	try {
		const ToolError = getToolErrorModel();
		ToolError.create({
			threadId: threadId || null,
			toolName,
			errorCode,
			errorMessage,
			params: sanitizeParams(params),
		}).catch((err) => {
			toolLogger.error({ err }, "Failed to persist tool error to DB");
		});
	} catch {
		// Chat DB not connected
	}
}

function sanitizeParams(
	params: Record<string, unknown> | null,
): Record<string, unknown> | null {
	if (!params) return null;
	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(params)) {
		if (/token|password|secret|key/i.test(key)) {
			sanitized[key] = "[redacted]";
		} else if (typeof value === "string" && value.length > 200) {
			sanitized[key] = value.slice(0, 197) + "...";
		} else {
			sanitized[key] = value;
		}
	}
	return sanitized;
}
