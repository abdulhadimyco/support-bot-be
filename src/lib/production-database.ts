import mongoose, { type Connection } from "mongoose";
import config from "../config/env";
import { USER_DB } from "../constants/databases";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let productionConnection: Connection | null = null;

const dbCache = new Map<
	string,
	ReturnType<ReturnType<Connection["getClient"]>["db"]>
>();

export const productionDbEnabled = (): boolean =>
	!!config.MONGO_PRODUCTION_URI;

export const connectProductionDatabase = async (
	logger: {
		info: (msg: string) => void;
		warn: (msg: string) => void;
		error: (obj: object, msg: string) => void;
	},
): Promise<void> => {
	if (!config.MONGO_PRODUCTION_URI) {
		logger.warn(
			"MONGO_PRODUCTION_URI not set — production cluster connection skipped",
		);
		return;
	}

	let retries = 0;

	while (retries < MAX_RETRIES) {
		try {
			logger.info("Connecting production cluster...");
			productionConnection = mongoose.createConnection(
				config.MONGO_PRODUCTION_URI!,
				{
					dbName: USER_DB,
				},
			);
			await productionConnection.asPromise();
			logger.info("Production cluster connected");
			return;
		} catch (err) {
			retries++;
			logger.error(
				{ err, retries },
				`Production cluster connection attempt ${retries} failed`,
			);

			if (retries >= MAX_RETRIES) {
				throw new Error(
					`Failed to connect to production cluster after ${MAX_RETRIES} attempts`,
				);
			}

			const delay = RETRY_DELAY_MS * Math.pow(2, retries - 1);
			logger.info(`Retrying in ${delay}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
};

export const disconnectProductionDatabase = async (
	logger: {
		info: (msg: string) => void;
		warn: (msg: string) => void;
		error: (obj: object, msg: string) => void;
	},
): Promise<void> => {
	try {
		if (productionConnection) {
			dbCache.clear();
			await productionConnection.close();
			logger.info("Production cluster disconnected");
		}
	} catch (err) {
		logger.error({ err }, "Error disconnecting production cluster");
		throw err;
	}
};

export const getProductionClusterDb = (dbName: string) => {
	if (!productionConnection || productionConnection.readyState !== 1) {
		return null;
	}

	const cached = dbCache.get(dbName);
	if (cached) return cached;

	const db = productionConnection.getClient().db(dbName);
	dbCache.set(dbName, db);
	return db;
};
export const checkProductionDatabaseHealth = async (): Promise<boolean> => {
	try {
		if (!productionConnection || productionConnection.readyState !== 1)
			return false;
		if (!productionConnection.db) return false;
		await productionConnection.db.admin().ping();
		return true;
	} catch {
		return false;
	}
};
