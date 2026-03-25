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

	PORT: z.string().regex(/^\d+$/).transform(Number).default("8086"),

	// Database (template default — used for business data in later phases)
	MONGO_DATABASE_URL: z.string(),
	REDIS_URL: z.string().optional(),

	// Chat Database (separate connection for threads/messages/agents)
	MONGO_CHAT_URI: z.string().min(1),
	MONGO_CHAT_DB: z.string().default("myco_support"),

	// Subscription Cluster (subscriptions, receipts, playback, sessions — read-only)
	MONGO_SUBSCRIPTION_URI: z.string().optional(),
	MONGO_SUBSCRIPTION_DB: z.string().default("myco_events"),

	// Production Cluster (users, engagement/watch history — read-only)
	MONGO_PRODUCTION_URI: z.string().optional(),
	MONGO_PRODUCTION_DB: z.string().default("mycoLive"),
	MONGO_ENGAGEMENT_DB: z.string().default("engagement"),

	// Payments Database — PostgreSQL (transactions, checkouts — read-only)
	POSTGRES_HOST: z.string().optional(),
	POSTGRES_PORT: z.string().regex(/^\d+$/).transform(Number).default("5432"),
	POSTGRES_USER: z.string().optional(),
	POSTGRES_PASSWORD: z.string().optional(),
	POSTGRES_DB: z.string().default("payments"),

	// Jira Integration
	JIRA_BASE_URL: z.string().optional(),
	JIRA_EMAIL: z.string().optional(),
	JIRA_API_TOKEN: z.string().optional(),
	JIRA_BOARD_ID: z.string().default("178"),

	// Auth (JWT validation only — no signing)
	JWT_SECRET: z.string().min(1),

	// AI Providers
	MINIMAX_API_KEY: z.string().min(1),
	ANTHROPIC_API_KEY: z.string().min(1),
	MINIMAX_MODEL: z.string().default("MiniMax-M2.7"),
	ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),

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
