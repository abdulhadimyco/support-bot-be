import type { FastifyInstance } from "fastify";
import { canAccess } from "../../middlewares/can-access";
import { userUpsert } from "../../middlewares/user-upsert";
import { handleChat } from "./chat.controller";
import { chatBodySchema } from "./chat.schema";

export default async function chatRoutes(app: FastifyInstance) {
	app.addHook("preHandler", canAccess());
	app.addHook("preHandler", userUpsert);

	app.post("/", { schema: { body: chatBodySchema } }, handleChat);
}
