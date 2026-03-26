import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import config from "../config/env";
import { toolLogger } from "./tools/errors";

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

let subscriptionClient: McpClient | null = null;
let productionClient: McpClient | null = null;

function createTransport(connectionString: string) {
	return new StdioClientTransport({
		command: "npx",
		args: ["-y", "mongodb-mcp-server@latest", "--readOnly"],
		env: {
			...process.env,
			MDB_MCP_CONNECTION_STRING: connectionString,
			MDB_MCP_READ_ONLY: "true",
		},
	});
}

export async function initMcpClients() {
	if (config.MONGO_SUBSCRIPTION_URI) {
		try {
			subscriptionClient = await createMCPClient({
				transport: createTransport(config.MONGO_SUBSCRIPTION_URI),
			});
			toolLogger.info("MongoDB MCP connected (subscription cluster)");
		} catch (e) {
			toolLogger.error(
				{ err: e },
				"MCP subscription cluster failed to start",
			);
		}
	}

	if (config.MONGO_PRODUCTION_URI) {
		try {
			productionClient = await createMCPClient({
				transport: createTransport(config.MONGO_PRODUCTION_URI),
			});
			toolLogger.info("MongoDB MCP connected (production cluster)");
		} catch (e) {
			toolLogger.error(
				{ err: e },
				"MCP production cluster failed to start",
			);
		}
	}
}

const ALLOWED_MCP_TOOLS = new Set([
	"find",
	"aggregate",
	"count",
	"collection-schema",
	"list-collections",
	"list-databases",
	"explain",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapMcpTool(name: string, toolDef: any) {
	const original = toolDef.execute;
	if (typeof original !== "function") return toolDef;

	return {
		...toolDef,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		execute: async (...args: any[]) => {
			const input = args[0];
			toolLogger.info({ tool: name, input }, `[MCP CALL] ${name}`);

			try {
				const result = await original(...args);

				const resultStr = JSON.stringify(result);
				const truncated =
					resultStr.length > 2000
						? resultStr.slice(0, 2000) +
							`... (${resultStr.length} chars total)`
						: resultStr;

				toolLogger.info(
					{ tool: name, outputLength: resultStr.length },
					`[MCP RESULT] ${name}: ${truncated}`,
				);

				return result;
			} catch (e) {
				toolLogger.error(
					{ tool: name, input, err: e },
					`[MCP ERROR] ${name} threw an exception`,
				);
				return {
					error: `MCP tool ${name} failed: ${(e as Error).message}`,
					code: "QUERY_FAILED",
				};
			}
		},
	};
}

export async function getMcpTools() {
	const tools: Record<string, unknown> = {};

	if (subscriptionClient) {
		const subTools = await subscriptionClient.tools();
		for (const [name, def] of Object.entries(subTools)) {
			if (ALLOWED_MCP_TOOLS.has(name))
				tools[`sub_${name}`] = wrapMcpTool(`sub_${name}`, def);
		}
	}

	const subCount = Object.keys(tools).length;

	if (productionClient) {
		const prodTools = await productionClient.tools();
		for (const [name, def] of Object.entries(prodTools)) {
			if (ALLOWED_MCP_TOOLS.has(name))
				tools[`prod_${name}`] = wrapMcpTool(`prod_${name}`, def);
		}
	}

	toolLogger.info(
		{
			totalMcpTools: Object.keys(tools).length,
			sub: subCount,
			prod: Object.keys(tools).length - subCount,
		},
		"MCP tools loaded",
	);

	return tools;
}

export async function closeMcpClients() {
	if (subscriptionClient) {
		await subscriptionClient.close();
		subscriptionClient = null;
	}
	if (productionClient) {
		await productionClient.close();
		productionClient = null;
	}
}
