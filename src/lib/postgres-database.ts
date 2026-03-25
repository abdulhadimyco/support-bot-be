import pg from "pg";
import config from "../config/env";

let pool: pg.Pool | null = null;

export const postgresEnabled = (): boolean => {
	return (
		Boolean(config.POSTGRES_HOST) &&
		Boolean(config.POSTGRES_USER) &&
		Boolean(config.POSTGRES_PASSWORD)
	);
};

export const connectPostgresDatabase = async (
	logger: {
		info: (msg: string) => void;
		warn: (msg: string) => void;
		error: (obj: object, msg: string) => void;
	},
): Promise<void> => {
	if (!postgresEnabled()) {
		logger.warn(
			"PostgreSQL not configured — payments database connection skipped",
		);
		return;
	}

	try {
		pool = new pg.Pool({
			host: config.POSTGRES_HOST,
			port: config.POSTGRES_PORT,
			user: config.POSTGRES_USER,
			password: config.POSTGRES_PASSWORD,
			database: config.POSTGRES_DB,
			max: 5,
			idleTimeoutMillis: 30000,
		});

		const client = await pool.connect();
		client.release();
		logger.info("PostgreSQL payments database connected");
	} catch (err) {
		logger.error({ err }, "PostgreSQL connection failed");
		pool = null;
	}
};

export const disconnectPostgresDatabase = async (
	logger: {
		info: (msg: string) => void;
		error: (obj: object, msg: string) => void;
	},
): Promise<void> => {
	try {
		if (pool) {
			await pool.end();
			logger.info("PostgreSQL database disconnected");
		}
	} catch (err) {
		logger.error({ err }, "Error disconnecting PostgreSQL");
	}
};

export const pgQuery = async (
	sql: string,
	params: unknown[] = [],
): Promise<pg.QueryResult | null> => {
	if (!pool) return null;
	return pool.query(sql, params);
};

export const checkPostgresDatabaseHealth = async (): Promise<boolean> => {
	if (!pool) return false;
	try {
		await pool.query("SELECT 1");
		return true;
	} catch {
		return false;
	}
};
