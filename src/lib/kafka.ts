import { Kafka, type Producer } from "kafkajs";
import config from "../config/env";

let producer: Producer;

export const connectKafka = async (
	logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void },
): Promise<void> => {
	const kafka = new Kafka({
		clientId: config.KAFKA_CLIENT_ID,
		brokers: [config.KAFKA_BROKER],
	});

	producer = kafka.producer();
	await producer.connect();
	logger.info("Kafka producer connected");
};

export const disconnectKafka = async (
	logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void },
): Promise<void> => {
	if (producer) {
		await producer.disconnect();
		logger.info("Kafka producer disconnected");
	}
};

export const getProducer = (): Producer => {
	if (!producer) {
		throw new Error("Kafka producer not initialized. Call connectKafka() first.");
	}
	return producer;
};
