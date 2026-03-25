import mongoose from "mongoose";
import config from "../config/env";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export const connectDatabase = async (
	logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void },
): Promise<void> => {
	let retries = 0;

	while (retries < MAX_RETRIES) {
		try {
			logger.info("Connecting database...");
			await mongoose.connect(config.MONGO_DATABASE_URL);
			logger.info("Database connected");
			return;
		} catch (err) {
			retries++;
			logger.error({ err, retries }, `Database connection attempt ${retries} failed`);

			if (retries >= MAX_RETRIES) {
				throw new Error(
					`Failed to connect to database after ${MAX_RETRIES} attempts`,
				);
			}

			const delay = RETRY_DELAY_MS * Math.pow(2, retries - 1);
			logger.info(`Retrying in ${delay}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
};

export const disconnectDatabase = async (
	logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void },
): Promise<void> => {
	try {
		await mongoose.disconnect();
		logger.info("Database disconnected");
	} catch (err) {
		logger.error({ err }, "Error disconnecting database");
		throw err;
	}
};

export const checkDatabaseHealth = async (): Promise<boolean> => {
	try {
		if (mongoose.connection.readyState !== 1) return false;
		if (!mongoose.connection.db) return false;
		await mongoose.connection.db.admin().ping();
		return true;
	} catch {
		return false;
	}
};
