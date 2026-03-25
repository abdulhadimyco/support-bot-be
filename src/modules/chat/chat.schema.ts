import { z } from "zod";

export const chatBodySchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string(),
			}),
		)
		.min(1),
	threadId: z.string().optional(),
});
