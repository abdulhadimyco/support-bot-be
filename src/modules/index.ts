import type { FastifyInstance } from "fastify";
import threadRoutes from "./threads/thread.routes";
import chatRoutes from "./chat/chat.routes";

export default async function registerModules(app: FastifyInstance) {
	await app.register(threadRoutes, { prefix: "/api/threads" });
	await app.register(chatRoutes, { prefix: "/api/chat" });
}
