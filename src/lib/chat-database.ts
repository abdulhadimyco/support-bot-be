import mongoose, { type Connection } from "mongoose";
import config from "../config/env";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let chatConnection: Connection | null = null;

export const connectChatDatabase = async (
	logger: {
		info: (msg: string) => void;
		error: (obj: object, msg: string) => void;
	},
): Promise<void> => {
	let retries = 0;

	while (retries < MAX_RETRIES) {
		try {
			logger.info("Connecting chat database...");
			chatConnection = mongoose.createConnection(config.MONGO_CHAT_URI, {
				dbName: config.MONGO_CHAT_DB,
			});
			await chatConnection.asPromise();
			logger.info("Chat database connected");
			return;
		} catch (err) {
			retries++;
			logger.error(
				{ err, retries },
				`Chat database connection attempt ${retries} failed`,
			);

			if (retries >= MAX_RETRIES) {
				throw new Error(
					`Failed to connect to chat database after ${MAX_RETRIES} attempts`,
				);
			}

			const delay = RETRY_DELAY_MS * Math.pow(2, retries - 1);
			logger.info(`Retrying in ${delay}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
};

export const disconnectChatDatabase = async (
	logger: {
		info: (msg: string) => void;
		error: (obj: object, msg: string) => void;
	},
): Promise<void> => {
	try {
		if (chatConnection) {
			await chatConnection.close();
			logger.info("Chat database disconnected");
		}
	} catch (err) {
		logger.error({ err }, "Error disconnecting chat database");
		throw err;
	}
};

export const getChatConnection = (): Connection => {
	if (!chatConnection || chatConnection.readyState !== 1) {
		throw new Error(
			"Chat database not connected. Call connectChatDatabase() first.",
		);
	}
	return chatConnection;
};

export const checkChatDatabaseHealth = async (): Promise<boolean> => {
	try {
		if (!chatConnection || chatConnection.readyState !== 1) return false;
		if (!chatConnection.db) return false;
		await chatConnection.db.admin().ping();
		return true;
	} catch {
		return false;
	}
};
