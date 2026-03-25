import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
	Registry,
	Counter,
	Histogram,
	Gauge,
	collectDefaultMetrics,
} from "prom-client";
import config from "../config/env";

declare module "fastify" {
	interface FastifyRequest {
		__startTime: bigint;
	}
}

const register = new Registry();

collectDefaultMetrics({ register, prefix: "app_" });

const httpRequestDuration = new Histogram({
	name: "http_request_duration_seconds",
	help: "Duration of HTTP requests in seconds",
	labelNames: ["method", "route", "status_code"],
	buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
	registers: [register],
});

const httpRequestTotal = new Counter({
	name: "http_requests_total",
	help: "Total number of HTTP requests",
	labelNames: ["method", "route", "status_code"],
	registers: [register],
});

const httpRequestsInProgress = new Gauge({
	name: "http_requests_in_progress",
	help: "Number of HTTP requests currently in progress",
	labelNames: ["method"],
	registers: [register],
});

function recordMetrics(request: FastifyRequest, statusCode: number) {
	const durationMs =
		Number(process.hrtime.bigint() - request.__startTime) / 1e6;
	const labels = {
		method: request.method,
		route: request.routeOptions?.url || request.url,
		status_code: statusCode.toString(),
	};

	httpRequestDuration.observe(labels, durationMs / 1000);
	httpRequestTotal.inc(labels);
	httpRequestsInProgress.dec({ method: request.method });
}

export default fp(
	async (fastify: FastifyInstance) => {
		if (!config.METRICS_ENABLED) return;

		fastify.decorateRequest("__startTime", BigInt(0));

		fastify.addHook("onRequest", async (request) => {
			request.__startTime = process.hrtime.bigint();
			httpRequestsInProgress.inc({ method: request.method });
		});

		fastify.addHook("onResponse", async (request, reply) => {
			recordMetrics(request, reply.statusCode);
		});

		
		fastify.addHook("onRequestAbort", async (request) => {
			httpRequestsInProgress.dec({ method: request.method });
		});

		fastify.get(
			"/metrics",
			{ schema: { hide: true } },
			async (_request, reply) => {
				const metrics = await register.metrics();
				reply.header("Content-Type", register.contentType).send(metrics);
			},
		);
	},
	{ name: "observability-plugin" },
);
