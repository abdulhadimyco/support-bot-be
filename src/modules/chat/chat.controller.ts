import type { FastifyReply, FastifyRequest } from "fastify";
import { streamText } from "ai";
import { getModel } from "../../ai/providers";
import { getThreadModel, getMessageModel } from "../../db/models";
import {
	BadRequestError,
	ForbiddenError,
	NotFoundError,
} from "../../lib/errors";
import { assertThreadOwnership } from "../../utils/thread.utils";
import config from "../../config/env";
import type { z } from "zod";
import type { chatBodySchema } from "./chat.schema";

type ChatBody = z.infer<typeof chatBodySchema>;

function extractText(msg: ChatBody["messages"][number]): string {
	if (msg.parts?.length) {
		return msg.parts
			.filter((p) => p.type === "text" && p.text)
			.map((p) => p.text!)
			.join("");
	}
	return msg.content ?? "";
}

function toModelMessages(messages: ChatBody["messages"]) {
	return messages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m) => ({
			role: m.role as "user" | "assistant",
			content: extractText(m),
		}));
}

export async function handleChat(
	request: FastifyRequest<{ Body: ChatBody }>,
	reply: FastifyReply,
) {
	const { messages, threadId } = request.body;
	const appUser = request.appUser!;
	const Thread = getThreadModel();
	const Message = getMessageModel();

	let thread;
	if (threadId) {
		thread = await Thread.findById(threadId);
		if (!thread) throw new NotFoundError("Thread not found");
		assertThreadOwnership(thread, appUser);
		if (thread.status === "closed") {
			throw new BadRequestError("Thread is closed");
		}
	} else {
		const firstUserMsg = messages.find((m) => m.role === "user");
		const title = firstUserMsg
			? extractText(firstUserMsg).slice(0, 100)
			: null;
		thread = await Thread.create({ userId: appUser._id, title });
	}

	// Save the latest user message to the database
	const lastMessage = messages[messages.length - 1];
	const lastUserText =
		lastMessage?.role === "user" ? extractText(lastMessage) : null;

	if (lastUserText) {
		await Message.create({
			threadId: thread._id,
			role: "user",
			content: lastUserText,
		});
	}

	// Stream AI response and handle assistant message persistence
	const startTime = Date.now();
	const model = getModel("primary");
	const threadIdStr = String(thread._id);

	const result = streamText({
		model,
		messages: toModelMessages(messages),
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

				if (lastUserText) {
					await Thread.findOneAndUpdate(
						{ _id: thread._id, title: null },
						{ title: lastUserText.slice(0, 100) },
					);
				}
			} catch (err) {
				request.log.error({ err }, "Failed to persist assistant message");
			}
		},
	});

	try {
		reply.hijack();
		result.pipeUIMessageStreamToResponse(reply.raw, {
			headers: {
				"X-Thread-Id": threadIdStr,
			},
		});
	} catch (err) {
		request.log.error({ err }, "Stream setup failed");
		if (!reply.raw.headersSent) {
			reply.raw.writeHead(500, { "Content-Type": "application/json" });
			reply.raw.end(JSON.stringify({ error: "Stream failed" }));
		}
	}
}