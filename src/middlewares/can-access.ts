import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../lib/errors";

type CanAccessOptions = {
	permissions?: string[];
};

export const canAccess = (options?: CanAccessOptions) => {
	return async (request: FastifyRequest, _reply: FastifyReply) => {
		if (!request.user) {
			throw new UnauthorizedError("Token is missing or expired");
		}

		if (options?.permissions?.length) {
			// TODO: check request.user against required permissions
		}
	};
};
