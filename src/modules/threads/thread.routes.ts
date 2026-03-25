import type { FastifyInstance } from "fastify";
import { canAccess } from "../../middlewares/can-access";
import { userUpsert } from "../../middlewares/user-upsert";
import {
	listThreads,
	createThread,
	getThread,
	updateThread,
	closeThread,
} from "./thread.controller";
import {
	listThreadsQuerySchema,
	createThreadBodySchema,
	updateThreadBodySchema,
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

	app.patch(
		"/:id",
		{ schema: { params: threadParamsSchema, body: updateThreadBodySchema } },
		updateThread,
	);

	app.delete(
		"/:id",
		{ schema: { params: threadParamsSchema } },
		closeThread,
	);
}
