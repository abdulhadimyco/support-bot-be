import { z } from "zod";
import { resolveCollection } from "./helpers";
import { ToolErrorCode, toolError, toolLogger } from "./errors";

const BLOCKED_STAGES = new Set([
	"$out",
	"$merge",
	"$lookup",
	"$graphLookup",
	"$collStats",
	"$indexStats",
	"$planCacheStats",
	"$currentOp",
	"$listSessions",
]);

const parameters = z.object({
	database: z.string().describe("Database name"),
	collection: z.string().describe("Collection name"),
	pipeline: z
		.array(z.record(z.unknown()))
		.describe("MongoDB aggregation pipeline stages as a JSON array"),
});

async function execute({
	database,
	collection,
	pipeline,
}: z.infer<typeof parameters>) {
	const col = resolveCollection(database, collection);
	if (!col) {
		return toolError(
			ToolErrorCode.ACCESS_DENIED,
			`${database}.${collection} is not in the allowlist.`,
			"mongoAggregate",
			{ database, collection },
		);
	}

	for (const stage of pipeline) {
		const key = Object.keys(stage)[0];
		if (key && BLOCKED_STAGES.has(key)) {
			return toolError(
				ToolErrorCode.BLOCKED,
				`Stage ${key} is not allowed.`,
				"mongoAggregate",
				{ database, collection, blockedStage: key },
			);
		}
	}

	const hasLimit = pipeline.some((s) => "$limit" in s);
	if (!hasLimit) pipeline.push({ $limit: 100 });

	try {
		const docs = await col.aggregate(pipeline).toArray();
		return { database, collection, count: docs.length, results: docs };
	} catch (e) {
		toolLogger.error({ err: e, database, collection }, "mongoAggregate failed");
		return toolError(
			ToolErrorCode.QUERY_FAILED,
			(e as Error).message,
			"mongoAggregate",
			{ database, collection },
		);
	}
}

export const mongoAggregate = {
	description:
		"Read-only MongoDB aggregation pipeline. Write stages ($out, $merge) and cross-collection stages ($lookup) are blocked.",
	parameters,
	execute,
};
