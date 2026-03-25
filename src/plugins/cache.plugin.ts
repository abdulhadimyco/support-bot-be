import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { RedisCache } from "../lib/cache";
import config from "../config/env";

declare module "fastify" {
	interface FastifyInstance {
		cache: RedisCache;
	}
}

export default fp(
	async (fastify: FastifyInstance) => {
		if (!config.CACHE_ENABLED || !config.REDIS_URL) {
			fastify.log.info("Cache disabled — skipping Redis connection");
			return;
		}

		const cache = new RedisCache(config.REDIS_URL, fastify.log);
		try {
			await cache.connect();
		} catch (err) {
			fastify.log.warn(
				{ err },
				"Redis connection failed — continuing without cache",
			);
			return;
		}

		fastify.decorate("cache", cache);

		fastify.addHook("onClose", async () => {
			await cache.getClient().quit();
		});
	},
	{ name: "cache-plugin" },
);
