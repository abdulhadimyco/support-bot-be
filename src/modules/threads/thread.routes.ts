import type { FastifyInstance } from "fastify";
import { canAccess } from "../../middlewares/can-access";
import { userUpsert } from "../../middlewares/user-upsert";
import {
	listThreads,
	createThread,
	getThread,
	closeThread,
} from "./thread.controller";
import {
	listThreadsQuerySchema,
	createThreadBodySchema,
	threadParamsSchema,
} from "./thread.schema";

export default async function threadRoutes(app: FastifyInstance) {
	app.addHook("preHandler", canAccess());
	app.addHook("preHandler", userUpsert);

	app.get(
		"/",
		{ schema: { querystring: listThreadsQuerySchema } },
		listThreads,
	);

	app.post(
		"/",
		{ schema: { body: createThreadBodySchema } },
		createThread,
	);

	app.get(
		"/:id",
		{ schema: { params: threadParamsSchema } },
		getThread,
	);

	app.delete(
		"/:id",
		{ schema: { params: threadParamsSchema } },
		closeThread,
	);
}
