import config from "./config/env";
import { connectDatabase, disconnectDatabase } from "./lib/database";
import { connectKafka, disconnectKafka } from "./lib/kafka";
import { buildApp } from "./app";

const start = async () => {
	const app = await buildApp();
	const logger = app.log;

	try {
		await connectDatabase(logger);
		await connectKafka(logger);

		await app.listen({ port: config.PORT, host: "0.0.0.0" });

		logger.info(`${config.APP_NAME} running on port ${config.PORT}`);
		logger.info(`Swagger docs at http://localhost:${config.PORT}/docs`);

		const shutdown = async (signal: string) => {
			logger.info(`Received ${signal}, shutting down...`);
			await app.close();
			await disconnectKafka(logger);
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
