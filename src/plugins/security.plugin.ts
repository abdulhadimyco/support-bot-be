import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import config from "../config/env";

export default fp(
	async (fastify: FastifyInstance) => {
		await fastify.register(helmet);

		if (config.CORS_ENABLED) {
			await fastify.register(cors, {
				origin: config.CORS_ORIGIN,
				credentials: true,
				exposedHeaders: ["X-Thread-Id"],
			});
		}

		if (config.RATE_LIMIT_ENABLED) {
			await fastify.register(rateLimit, {
				max: config.RATE_LIMIT_MAX_REQUESTS,
				timeWindow: config.RATE_LIMIT_WINDOW_MS,
				allowList: (request) => {
					const skipPaths = ["/health", "/metrics"];
					return skipPaths.some((p) => request.url.endsWith(p));
				},
			});
		}
	},
	{ name: "security-plugin" },
);
