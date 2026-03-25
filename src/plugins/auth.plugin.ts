import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verify } from "jsonwebtoken";
import config from "../config/env";
import type { JwtPayload } from "../types/jwt";

declare module "fastify" {
	interface FastifyRequest {
		user: JwtPayload | null;
	}
}

export default fp(
	async (fastify: FastifyInstance) => {
		fastify.decorateRequest("user", null);

		fastify.addHook("onRequest", async (request: FastifyRequest) => {
			const token = extractToken(request);
			if (!token) {
				request.user = null;
				return;
			}

			try {
				const payload = verify(token, config.JWT_SECRET) as JwtPayload;
				request.user = payload;
			} catch {
				request.user = null;
			}
		});
	},
	{ name: "auth-plugin" },
);

function extractToken(request: FastifyRequest): string | null {
	const authHeader = request.headers.authorization;
	if (authHeader?.startsWith("Bearer ")) {
		return authHeader.slice(7);
	}

	const cookies = request.cookies;
	if (cookies?.["auth-token"]) {
		return cookies["auth-token"];
	}

	return null;
}
