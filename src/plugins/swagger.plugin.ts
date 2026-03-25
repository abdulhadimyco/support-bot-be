import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import config from "../config/env";

export default fp(
	async (fastify: FastifyInstance) => {
		await fastify.register(swagger, {
			openapi: {
				info: {
					title: config.APP_NAME,
					version: config.APP_VERSION,
					description: `${config.APP_NAME} API`,
				},
				servers: [
					{
						url: `http://localhost:${config.PORT}`,
						description: "Local dev",
					},
				],
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
							bearerFormat: "JWT",
						},
					},
				},
			},
			transform: jsonSchemaTransform,
		});

		await fastify.register(swaggerUi, {
			routePrefix: "/docs",
		});
	},
	{ name: "swagger-plugin" },
);
