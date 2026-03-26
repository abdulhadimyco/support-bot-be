import config from "./config/env";
import {
	connectChatDatabase,
	disconnectChatDatabase,
} from "./lib/chat-database";
import {
	connectSubscriptionDatabase,
	disconnectSubscriptionDatabase,
} from "./lib/subscription-database";
import {
	connectProductionDatabase,
	disconnectProductionDatabase,
} from "./lib/production-database";
import {
	connectPostgresDatabase,
	disconnectPostgresDatabase,
} from "./lib/payments-database";
import { initMcpClients, closeMcpClients } from "./ai/mcp-mongo";
import { buildApp } from "./app";

const start = async () => {
	const app = await buildApp();
	const logger = app.log;

	try {
		await Promise.all([
			connectChatDatabase(logger),
			connectSubscriptionDatabase(logger),
			connectProductionDatabase(logger),
			connectPostgresDatabase(logger),
		]);
		logger.info("Initializing MongoDB MCP clients");

		await initMcpClients();
		logger.info("MongoDB MCP clients initialized");

		await app.listen({ port: config.PORT, host: "0.0.0.0" });

		logger.info(`${config.APP_NAME} running on port ${config.PORT}`);
		logger.info(`Swagger docs at http://localhost:${config.PORT}/docs`);

		const shutdown = async (signal: string) => {
			logger.info(`Received ${signal}, shutting down...`);
			await app.close();
			await closeMcpClients();
			await disconnectPostgresDatabase(logger);
			await disconnectProductionDatabase(logger);
			await disconnectSubscriptionDatabase(logger);
			await disconnectChatDatabase(logger);
			process.exit(0);
		};

		process.on("SIGINT", () => shutdown("SIGINT"));
		process.on("SIGTERM", () => shutdown("SIGTERM"));
	} catch (err) {
		logger.error(err, "Failed to start server");
		process.exit(1);
	}
};

start();
