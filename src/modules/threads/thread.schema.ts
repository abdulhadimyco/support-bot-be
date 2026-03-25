import { z } from "zod";

export const listThreadsQuerySchema = z.object({
	page: z.string().regex(/^\d+$/).transform(Number).default("1"),
	limit: z.string().regex(/^\d+$/).transform(Number).default("20"),
	status: z.enum(["active", "closed"]).optional(),
});

export const createThreadBodySchema = z.object({
	title: z.string().max(200).optional(),
});

export const threadParamsSchema = z.object({
	id: z.string().min(1),
});
