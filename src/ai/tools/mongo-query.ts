import { z } from "zod";
import { resolveCollection, describeAllowlist } from "./helpers";
import { ToolErrorCode, toolError, toolLogger } from "./errors";

const BLOCKED_OPERATORS = new Set([
	"$where",
	"$function",
	"$accumulator",
]);

function containsBlockedOperator(obj: unknown): string | null {
	if (!obj || typeof obj !== "object") return null;
	if (Array.isArray(obj)) {
		for (const item of obj) {
			const found = containsBlockedOperator(item);
			if (found) return found;
		}
		return null;
	}
	for (const key of Object.keys(obj as Record<string, unknown>)) {
		if (BLOCKED_OPERATORS.has(key)) return key;
		const found = containsBlockedOperator(
			(obj as Record<string, unknown>)[key],
		);
		if (found) return found;
	}
	return null;
}

const parameters = z.object({
	database: z
		.string()
		.describe(
			"Database name (e.g. subscription, user, engagement, video, reference)",
		),
	collection: z.string().describe("Collection name"),
	filter: z
		.record(z.unknown())
		.optional()
		.default({})
		.describe("MongoDB filter object"),
	projection: z
		.record(z.number())
		.optional()
		.describe("Fields to include (1) or exclude (0)"),
	sort: z
		.record(z.number())
		.optional()
		.describe("Sort object (e.g. { createdAt: -1 })"),
	limit: z
		.number()
		.min(1)
		.max(100)
		.optional()
		.default(20)
		.describe("Max documents to return (default 20, max 100)"),
});

async function execute(
	{
		database,
		collection,
		filter,
		projection,
		sort,
		limit,
	}: z.infer<typeof parameters>,

) {
	const col = resolveCollection(database, collection);
	if (!col) {
		return toolError(ToolErrorCode.ACCESS_DENIED, `${database}.${collection} is not allowed.\n\nAllowed:\n${describeAllowlist()}`, "mongoQuery", { database, collection });
	}

	const blocked = containsBlockedOperator(filter);
	if (blocked) {
		return toolError(ToolErrorCode.BLOCKED, `Operator ${blocked} is not allowed.`, "mongoQuery", { database, collection });
	}

	try {
		let cursor = col.find(filter || {});
		if (projection) cursor = cursor.project(projection);
		if (sort) cursor = cursor.sort(sort as Record<string, 1 | -1>);
		cursor = cursor.limit(limit ?? 20);

		const docs = await cursor.toArray();
		return { database, collection, count: docs.length, documents: docs };
	} catch (e) {
		toolLogger.error({ err: e, database, collection }, "mongoQuery failed");
		return toolError(ToolErrorCode.QUERY_FAILED, (e as Error).message, "mongoQuery", { database, collection });
	}
}

export const mongoQuery = {
	description: `Read-only MongoDB find query on allowed collections. Allowed:\n${describeAllowlist()}`,
	parameters,
	execute,
};
