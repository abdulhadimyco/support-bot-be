import type { FastifyInstance } from "fastify";
import { handlePresignUpload, handlePresignView } from "./upload.controller";
import { canAccess } from "../../middlewares/can-access";

export default async function uploadRoutes(app: FastifyInstance) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	app.post("/presign", { preHandler: [canAccess()] }, handlePresignUpload as any);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	app.post("/view", { preHandler: [canAccess()] }, handlePresignView as any);
}
