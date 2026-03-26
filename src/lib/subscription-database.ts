import mongoose, { type Connection } from "mongoose";
import config from "../config/env";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let subscriptionConnection: Connection | null = null;

export const subscriptionDbEnabled = (): boolean =>
	!!config.MONGO_SUBSCRIPTION_URI;

export const connectSubscriptionDatabase = async (
	logger: {
		info: (msg: string) => void;
		warn: (msg: string) => void;
		error: (obj: object, msg: string) => void;
	},
): Promise<void> => {
	if (!config.MONGO_SUBSCRIPTION_URI) {
		logger.warn(
			"MONGO_SUBSCRIPTION_URI not set — subscription cluster connection skipped",
		);
		return;
	}

	let retries = 0;

	while (retries < MAX_RETRIES) {
		try {
			logger.info("Connecting subscription cluster...");
			subscriptionConnection = mongoose.createConnection(
				config.MONGO_SUBSCRIPTION_URI,
				{
					dbName: "subscription",
				},
			);
			await subscriptionConnection.asPromise();
			logger.info("Subscription cluster connected");
			return;
		} catch (err) {
			retries++;
			logger.error(
				{ err, retries },
				`Subscription cluster connection attempt ${retries} failed`,
			);

			if (retries >= MAX_RETRIES) {
				throw new Error(
					`Failed to connect to subscription cluster after ${MAX_RETRIES} attempts`,
				);
			}

			const delay = RETRY_DELAY_MS * Math.pow(2, retries - 1);
			logger.info(`Retrying in ${delay}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
};

export const disconnectSubscriptionDatabase = async (
	logger: {
		info: (msg: string) => void;
		warn: (msg: string) => void;
		error: (obj: object, msg: string) => void;
	},
): Promise<void> => {
	try {
		if (subscriptionConnection) {
			await subscriptionConnection.close();
			logger.info("Subscription cluster disconnected");
		}
	} catch (err) {
		logger.error({ err }, "Error disconnecting subscription cluster");
		throw err;
	}
};

export const getSubscriptionConnection = (): Connection | null => {
	if (!subscriptionConnection || subscriptionConnection.readyState !== 1) {
		return null;
	}
	return subscriptionConnection;
};

export const checkSubscriptionDatabaseHealth = async (): Promise<boolean> => {
	try {
		if (
			!subscriptionConnection ||
			subscriptionConnection.readyState !== 1
		)
			return false;
		if (!subscriptionConnection.db) return false;
		await subscriptionConnection.db.admin().ping();
		return true;
	} catch {
		return false;
	}
};
