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
		if (!config.CACHE_ENABLED) return;

		const cache = new RedisCache(config.REDIS_URL, fastify.log);
		await cache.connect();
		fastify.decorate("cache", cache);

		fastify.addHook("onClose", async () => {
			await cache.getClient().quit();
		});
	},
	{ name: "cache-plugin" },
);
