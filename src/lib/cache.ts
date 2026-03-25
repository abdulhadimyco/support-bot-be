import Redis from "ioredis";
import type { FastifyBaseLogger } from "fastify";

export class RedisCache {
	private client: Redis;

	constructor(redisUrl: string, logger: FastifyBaseLogger) {
		this.client = new Redis(redisUrl, {
			lazyConnect: true,
			enableReadyCheck: true,
		});

		this.client.on("connect", () => logger.info("Redis connected"));
		this.client.on("error", (err) => logger.error({ err }, "Redis error"));
	}

	async connect(): Promise<void> {
		await this.client.connect();
	}

	async get<T = unknown>(key: string): Promise<T | null> {
		const value = await this.client.get(key);
		if (!value) return null;
		return JSON.parse(value) as T;
	}

	async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
		const serialized = JSON.stringify(value);
		if (ttlSeconds) {
			await this.client.set(key, serialized, "EX", ttlSeconds);
		} else {
			await this.client.set(key, serialized);
		}
	}

	async del(key: string): Promise<void> {
		await this.client.del(key);
	}

	async exists(key: string): Promise<boolean> {
		const count = await this.client.exists(key);
		return count > 0;
	}

	getClient(): Redis {
		return this.client;
	}
}
