import pino from "pino";

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

export function toolError(code: ToolErrorCode, message: string): ToolError {
	return { error: message, code };
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
