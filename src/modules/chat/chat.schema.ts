import { z } from "zod";
import { objectIdSchema } from "../threads/thread.schema";

const uiMessageSchema = z.object({
	id: z.string().optional(),
	role: z.enum(["user", "assistant", "system"]),
	parts: z
		.array(
			z
				.object({
					type: z.string(),
					text: z.string().optional(),
				})
				.passthrough(), // extra fields are allowed
		)
		.optional(),
	content: z.string().optional(),
});

export const chatBodySchema = z.object({
	messages: z.array(uiMessageSchema).min(1),
	threadId: z.preprocess(
		(val) => (val === "" || val === null ? undefined : val),
		objectIdSchema.optional(),
	),
	id: z.string().optional(),
	trigger: z.string().optional(),
	messageId: z.string().optional(),
});
