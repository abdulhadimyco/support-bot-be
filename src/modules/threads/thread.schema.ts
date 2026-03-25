import { z } from "zod";

export const objectIdSchema = z
	.string()
	.regex(/^[a-f0-9]{24}$/, "Invalid ObjectId");

export const listThreadsQuerySchema = z.object({
	page: z.string().regex(/^\d+$/).transform(Number).default("1"),
	limit: z.string().regex(/^\d+$/).transform(Number).default("20"),
	status: z.enum(["active", "closed"]).optional(),
});

export const createThreadBodySchema = z.object({
	title: z.string().max(200).optional(),
});

export const threadParamsSchema = z.object({
	id: objectIdSchema,
});

export const updateThreadBodySchema = z.object({
	title: z.string().max(200).min(1),
});
