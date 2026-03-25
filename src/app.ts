import Fastify from "fastify";
import cookie from "@fastify/cookie";
import compress from "@fastify/compress";
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import config from "./config/env";
import securityPlugin from "./plugins/security.plugin";
import swaggerPlugin from "./plugins/swagger.plugin";
import authPlugin from "./plugins/auth.plugin";
import cachePlugin from "./plugins/cache.plugin";
import observabilityPlugin from "./plugins/observability.plugin";
import { errorHandler } from "./middlewares/error-handler";
import { checkDatabaseHealth } from "./lib/database";
import registerModules from "./modules";

export const buildApp = async () => {
	const fastify = Fastify({
		logger: {
			level: config.LOG_LEVEL,
			transport:
				config.NODE_ENV === "development"
					? {
							target: "pino-pretty",
							options: {
								colorize: true,
								translateTime: "HH:MM:ss.l",
								ignore: "pid,hostname",
							},
						}
					: undefined,
		},
		trustProxy: config.TRUST_PROXY,
		genReqId: () => crypto.randomUUID(),
	}).withTypeProvider<ZodTypeProvider>();

	// Zod type provider
	fastify.setValidatorCompiler(validatorCompiler);
	fastify.setSerializerCompiler(serializerCompiler);

	// Error handler
	fastify.setErrorHandler(errorHandler);

	// Core plugins
	await fastify.register(cookie);
	await fastify.register(compress);

	// App plugins
	await fastify.register(securityPlugin);
	await fastify.register(swaggerPlugin);
	await fastify.register(authPlugin);
	await fastify.register(cachePlugin);
	await fastify.register(observabilityPlugin);

	// Modules
	await fastify.register(registerModules);

	// Health check
	fastify.get("/health", { schema: { hide: true } }, async () => {
		const dbHealthy = await checkDatabaseHealth();
		return {
			success: true,
			statusCode: 200,
			data: {
				status: dbHealthy ? "healthy" : "degraded",
				service: config.APP_NAME,
				version: config.APP_VERSION,
				uptime: process.uptime(),
				database: dbHealthy ? "connected" : "disconnected",
			},
		};
	});

	return fastify;
};
