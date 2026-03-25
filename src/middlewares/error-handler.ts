import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../lib/errors";
import { ZodError } from "zod";
import config from "../config/env";

export const errorHandler = (
	error: FastifyError | Error,
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	request.log.error(error);

	if (error instanceof ZodError) {
		return reply.status(400).send({
			success: false,
			statusCode: 400,
			message: "Validation failed",
			error: "bad_request",
			data: error.flatten(),
		});
	}

	if (error instanceof AppError) {
		return reply.status(error.statusCode).send({
			success: false,
			statusCode: error.statusCode,
			message: error.message,
			error: error.name,
			data: null,
		});
	}

	if ("statusCode" in error) {
		const fe = error as FastifyError;
		return reply.status(fe.statusCode!).send({
			success: false,
			statusCode: fe.statusCode,
			message: fe.message,
			error: fe.code || "error",
			data: null,
		});
	}

	const statusCode = 500;
	return reply.status(statusCode).send({
		success: false,
		statusCode,
		message:
			config.NODE_ENV === "production"
				? "Internal Server Error"
				: error.message,
		error: "internal_server_error",
		data: config.NODE_ENV === "development" ? { stack: error.stack } : null,
	});
};
