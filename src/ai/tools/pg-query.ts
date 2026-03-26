import { z } from "zod";
import { pgQuery, postgresEnabled } from "../../lib/payments-database";
import { PG_TABLE_ALLOWLIST } from "../../constants/databases";
import { ToolErrorCode, toolError, toolLogger } from "./errors";

const WRITE_PATTERNS =
	/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;

const DANGEROUS_FUNCTIONS =
	/\b(pg_read_file|pg_ls_dir|dblink|lo_import|lo_export|copy|pg_sleep)\b/i;

const parameters = z.object({
	sql: z
		.string()
		.describe(
			`SELECT SQL query. Allowed tables: ${[...PG_TABLE_ALLOWLIST].join(", ")}. Always include LIMIT.`,
		),
	params: z
		.array(z.unknown())
		.optional()
		.default([])
		.describe("Parameterized query values ($1, $2, etc.)"),
});

async function execute(
	{ sql, params }: z.infer<typeof parameters>,

) {
	const sqlPreview = sql.slice(0, 200);

	if (!postgresEnabled()) {
		return toolError(ToolErrorCode.DB_UNAVAILABLE, "Payments PostgreSQL database not connected.", "pgQuery");
	}

	if (sql.includes(";")) {
		return toolError(ToolErrorCode.BLOCKED, "Multiple statements not allowed.", "pgQuery", { sql: sqlPreview });
	}

	if (WRITE_PATTERNS.test(sql)) {
		return toolError(ToolErrorCode.BLOCKED, "Write operations not allowed. SELECT only.", "pgQuery", { sql: sqlPreview });
	}

	if (DANGEROUS_FUNCTIONS.test(sql)) {
		return toolError(ToolErrorCode.BLOCKED, "This function is not allowed.", "pgQuery", { sql: sqlPreview });
	}

	const tablePattern = /\b(?:FROM|JOIN)\s+["']?(\w+)["']?/gi;
	const tables = new Set<string>();
	let match;
	while ((match = tablePattern.exec(sql)) !== null) {
		tables.add(match[1].toLowerCase());
	}

	for (const table of tables) {
		if (!(PG_TABLE_ALLOWLIST as Set<string>).has(table)) {
			return toolError(ToolErrorCode.ACCESS_DENIED, `Table "${table}" not allowed. Allowed: ${[...PG_TABLE_ALLOWLIST].join(", ")}`, "pgQuery", { sql: sqlPreview });
		}
	}

	if (!/\bLIMIT\b/i.test(sql)) {
		return toolError(ToolErrorCode.INVALID_INPUT, "Query must include a LIMIT clause (max 200).", "pgQuery", { sql: sqlPreview });
	}

	try {
		const result = await pgQuery(sql, params || []);
		if (!result) return toolError(ToolErrorCode.QUERY_FAILED, "Query returned no result.", "pgQuery", { sql: sqlPreview });
		return { row_count: result.rowCount, rows: result.rows };
	} catch (e) {
		toolLogger.error({ err: e, sql: sqlPreview }, "pgQuery failed");
		return toolError(ToolErrorCode.QUERY_FAILED, (e as Error).message, "pgQuery", { sql: sqlPreview });
	}
}

export const pgQueryTool = {
	description: `Read-only SELECT on payments PostgreSQL. Allowed tables: ${[...PG_TABLE_ALLOWLIST].join(", ")}. Include LIMIT.`,
	parameters,
	execute,
};
