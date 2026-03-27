import type { FastifyReply, FastifyRequest } from "fastify";
import { streamText, stepCountIs } from "ai";
import { getModel } from "../../ai/providers";
import { getThreadModel, getMessageModel } from "../../db/models";
import {
	BadRequestError,
	NotFoundError,
} from "../../lib/errors";
import { assertThreadOwnership } from "../../utils/thread.utils";
import { specializedTools } from "../../ai/tools";
import { getMcpTools } from "../../ai/mcp-mongo";
import { getSystemPrompt } from "../../ai/system-prompt";
import { autoPrefetch } from "../../ai/prefetch";
import config from "../../config/env";
import type { z } from "zod";
import type { chatBodySchema } from "./chat.schema";

type ChatBody = z.infer<typeof chatBodySchema>;

interface FilePart {
	mediaType: string;
	url: string;
	filename?: string;
}

function extractText(msg: ChatBody["messages"][number]): string {
	if (msg.parts?.length) {
		return msg.parts
			.filter((p) => p.type === "text" && p.text)
			.map((p) => p.text!)
			.join("");
	}
	return msg.content ?? "";
}

function extractFiles(msg: ChatBody["messages"][number]): FilePart[] {
	if (!msg.parts?.length) return [];
	return msg.parts
		.filter((p) => p.type === "file")
		.map((p) => ({
			mediaType: (p as any).mediaType || "application/octet-stream",
			url: (p as any).url || "",
			filename: (p as any).filename,
		}))
		.filter((f) => f.url);
}

function toModelMessages(messages: ChatBody["messages"]) {
	const result: Array<{ role: "user" | "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "image"; image: string; mimeType?: string }> }> = [];

	for (const m of messages) {
		if (m.role !== "user" && m.role !== "assistant") continue;
		const text = extractText(m);
		const files = extractFiles(m);

		if (m.role === "user" && files.length > 0) {
			const parts: Array<{ type: "text"; text: string } | { type: "image"; image: string; mimeType?: string }> = [];
			if (text) parts.push({ type: "text", text });
			for (const f of files) {
				if (f.mediaType.startsWith("image/")) {
					parts.push({ type: "image", image: f.url, mimeType: f.mediaType });
				}
			}
			result.push({ role: "user", content: parts.length > 0 ? parts : text });
		} else {
			result.push({ role: m.role as "user" | "assistant", content: text });
		}
	}

	return result;
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

	const lastMessage = messages[messages.length - 1];
	const lastUserText =
		lastMessage?.role === "user" ? extractText(lastMessage) : null;
	const lastUserFiles =
		lastMessage?.role === "user" ? extractFiles(lastMessage) : [];

	if (lastUserText || lastUserFiles.length > 0) {
		await Message.create({
			threadId: thread._id,
			role: "user",
			content: lastUserText || "(attached file)",
			...(lastUserFiles.length > 0
				? {
						files: lastUserFiles.map((f) => {
							let storedUrl = f.url;
							try {
								const parsed = new URL(f.url);
								storedUrl = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
							} catch {
								storedUrl = f.url;
							}
							return { mediaType: f.mediaType, url: storedUrl, filename: f.filename };
						}),
					}
				: {}),
		});
	}

	const startTime = Date.now();
	const model = getModel("primary");
	const threadIdStr = String(thread._id);



	let prefetchContext: string | null = null;
	if (lastUserText) {
		try {
			const prefetch = await autoPrefetch(lastUserText);
			prefetchContext = prefetch.context;
		} catch (err) {
			request.log.error({ err }, "Auto-prefetch failed");
		}
	}

	const modelMessages = toModelMessages(messages);

	const basePrompt = getSystemPrompt(appUser.name || appUser.username || "Support");
	const systemPrompt = prefetchContext
		? `${basePrompt}\n\n--- PRE-FETCHED CUSTOMER DATA ---\n${prefetchContext}`
		: basePrompt;

	const mcpTools = await getMcpTools();
	const tools = { ...specializedTools, ...mcpTools };
	request.log.info({ specializedCount: Object.keys(specializedTools).length, mcpCount: Object.keys(mcpTools).length, totalTools: Object.keys(tools).length }, "Tools loaded for chat");

	const result = streamText({
		model,
		system: systemPrompt,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		messages: modelMessages as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		tools: tools as any,
		stopWhen: stepCountIs(8),
		onFinish: async ({ text, steps }) => {
			try {
				const elapsedMs = Date.now() - startTime;

				const toolInvocations: Array<{
					toolCallId: string;
					toolName: string;
					input?: Record<string, unknown>;
					output?: unknown;
				}> = [];

				if (steps) {
					for (const step of steps) {
						if (step.toolCalls) {
							for (const tc of step.toolCalls) {
								const result = step.toolResults?.find(
									(tr: any) => tr.toolCallId === tc.toolCallId,
								);
								toolInvocations.push({
									toolCallId: tc.toolCallId,
									toolName: tc.toolName,
									input: tc.input as Record<string, unknown>,
									output: result?.output,
								});
							}
						}
					}
				}

				await Message.create({
					threadId: thread._id,
					role: "assistant",
					content: text,
					metadata: {
						model: config.MINIMAX_MODEL,
						provider: "minimax",
						elapsedMs,
					},
					...(toolInvocations.length > 0 ? { toolInvocations } : {}),
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