import "dotenv/config";
import pino from "pino";
import { seeders } from "../src/seeders/registry";
import { runSeeders } from "../src/seeders/runner";

const logger = pino({
	level: "info",
	transport: {
		target: "pino-pretty",
		options: { colorize: true, translateTime: "HH:MM:ss.l" },
	},
});

const args = process.argv.slice(2);
const group = args.find((a) => a.startsWith("--group="))?.split("=")[1];
const fresh = args.includes("--fresh");
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

runSeeders(seeders, logger, { group, fresh, force, dryRun })
	.then(() => {
		logger.info("Seeding complete");
		process.exit(0);
	})
	.catch((err) => {
		logger.error(err, "Seeding failed");
		process.exit(1);
	});
