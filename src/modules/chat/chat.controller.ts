import type { FastifyReply, FastifyRequest } from "fastify";
import { streamText } from "ai";
import { getModel } from "../../ai/providers";
import { getThreadModel, getMessageModel } from "../../db/models";
import {
	BadRequestError,
	ForbiddenError,
	NotFoundError,
} from "../../lib/errors";
import config from "../../config/env";
import type { z } from "zod";
import type { chatBodySchema } from "./chat.schema";

type ChatBody = z.infer<typeof chatBodySchema>;

export async function handleChat(
	request: FastifyRequest<{ Body: ChatBody }>,
	reply: FastifyReply,
) {
	const { messages, threadId } = request.body;
	const appUser = request.appUser!;
	const Thread = getThreadModel();
	const Message = getMessageModel();

	// 1. Resolve or create thread
	let thread;
	if (threadId) {
		thread = await Thread.findById(threadId);
		if (!thread) throw new NotFoundError("Thread not found");
		if (String(thread.userId) !== String(appUser._id)) {
			throw new ForbiddenError("Thread does not belong to you");
		}
		if (thread.status === "closed") {
			throw new BadRequestError("Thread is closed");
		}
	} else {
		const firstUserMsg = messages.find((m) => m.role === "user");
		thread = await Thread.create({
			userId: appUser._id,
			title: firstUserMsg?.content.slice(0, 100) || null,
		});
	}

	// 2. Save the latest user message to DB
	const lastMessage = messages[messages.length - 1];
	if (lastMessage?.role === "user") {
		await Message.create({
			threadId: thread._id,
			role: "user",
			content: lastMessage.content,
		});
	}

	// 3. Stream AI response
	const startTime = Date.now();
	const model = getModel("primary");

	const result = streamText({
		model,
		messages: messages.map((m) => ({ role: m.role, content: m.content })),
		onFinish: async ({ text, usage }) => {
			try {
				const elapsedMs = Date.now() - startTime;

				await Message.create({
					threadId: thread._id,
					role: "assistant",
					content: text,
					metadata: {
						model: config.MINIMAX_MODEL,
						provider: "minimax",
						inputTokens: usage?.inputTokens ?? null,
						outputTokens: usage?.outputTokens ?? null,
						elapsedMs,
					},
				});

				// Set thread title from first user message if not set
				if (!thread.title && lastMessage?.content) {
					thread.title = lastMessage.content.slice(0, 100);
					await thread.save();
				}
			} catch (err) {
				request.log.error({ err }, "Failed to save assistant message");
			}
		},
	});

	// 4. Hijack Fastify's response lifecycle and pipe SSE stream
	reply.hijack();
	result.pipeTextStreamToResponse(reply.raw, {
		headers: {
			"X-Thread-Id": String(thread._id),
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
