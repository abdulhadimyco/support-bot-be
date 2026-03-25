import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanString = z
	.string()
	.transform((value) => value === "true" || value === "1")
	.pipe(z.boolean());

const configSchema = z.object({
	NODE_ENV: z
		.enum(["production", "development", "test"])
		.default("development"),

	PORT: z.string().regex(/^\d+$/).transform(Number).default("3000"),

	// Database
	MONGO_DATABASE_URL: z.string().url(),
	REDIS_URL: z.string().url(),

	// Auth (JWT validation only — no signing)
	JWT_SECRET: z.string().min(1),

	// Kafka
	KAFKA_BROKER: z.string().default("localhost:9092"),
	KAFKA_CLIENT_ID: z.string().default("app-service"),

	// Observability
	LOG_LEVEL: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal"])
		.default("info"),
	METRICS_ENABLED: booleanString.default("true"),

	// Cache
	CACHE_ENABLED: booleanString.default("true"),
	CACHE_PREFIX: z.string().default("app:"),
	CACHE_DEFAULT_TTL: z.string().transform(Number).default("3600"),

	// Security
	CORS_ENABLED: booleanString.default("true"),
	CORS_ORIGIN: z.string().default("*"),
	RATE_LIMIT_ENABLED: booleanString.default("false"),
	RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default("900000"),
	RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default("100"),
	TRUST_PROXY: booleanString.default("false"),

	APP_NAME: z.string().default("App Service"),
	APP_VERSION: z.string().default("1.0.0"),
});

export type Config = z.infer<typeof configSchema>;

const config = configSchema.parse(process.env);

export default config;
