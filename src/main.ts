import config from "./config/env";
import { connectDatabase, disconnectDatabase } from "./lib/database";
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
} from "./lib/postgres-database";
import { buildApp } from "./app";

const start = async () => {
	const app = await buildApp();
	const logger = app.log;

	try {
		await connectDatabase(logger);
		await connectChatDatabase(logger);
		await connectSubscriptionDatabase(logger);
		await connectProductionDatabase(logger);
		await connectPostgresDatabase(logger);

		await app.listen({ port: config.PORT, host: "0.0.0.0" });

		logger.info(`${config.APP_NAME} running on port ${config.PORT}`);
		logger.info(`Swagger docs at http://localhost:${config.PORT}/docs`);

		const shutdown = async (signal: string) => {
			logger.info(`Received ${signal}, shutting down...`);
			await app.close();
			await disconnectPostgresDatabase(logger);
			await disconnectProductionDatabase(logger);
			await disconnectSubscriptionDatabase(logger);
			await disconnectChatDatabase(logger);
			await disconnectDatabase(logger);
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
