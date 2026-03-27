import type { Types } from "mongoose";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
	getThreadModel,
	getMessageModel,
	type IThread,
	type IMessage,
} from "../../db/models";
import { NotFoundError } from "../../lib/errors";
import { assertThreadOwnership } from "../../utils/thread.utils";
import {
	successResponse,
	paginatedResponse,
} from "../../utils/response.utils";
import { getPaginator } from "../../utils/pagination.utils";
import type {
	listThreadsQuerySchema,
	createThreadBodySchema,
	threadParamsSchema,
	updateThreadBodySchema,
} from "./thread.schema";
import type { z } from "zod";

type ListQuery = z.infer<typeof listThreadsQuerySchema>;
type CreateBody = z.infer<typeof createThreadBodySchema>;
type ThreadParams = z.infer<typeof threadParamsSchema>;
type UpdateBody = z.infer<typeof updateThreadBodySchema>;

function serializeThread(doc: IThread & { _id: Types.ObjectId }) {
	return {
		id: String(doc._id),
		userId: String(doc.userId),
		customerEmail: null,
		customerName: null,
		summary: doc.title ?? null,
		status: doc.status,
		createdAt: doc.createdAt.toISOString(),
		updatedAt: doc.updatedAt.toISOString(),
	};
}

function serializeMessage(doc: IMessage & { _id: Types.ObjectId }) {
	return {
		id: String(doc._id),
		threadId: String(doc.threadId),
		role: doc.role,
		content: doc.content,
		metadata: doc.metadata ?? null,
		toolInvocations: doc.toolInvocations ?? null,
		createdAt: doc.createdAt.toISOString(),
	};
}

export async function listThreads(
	request: FastifyRequest<{ Querystring: ListQuery }>,
	_reply: FastifyReply,
) {
	const { page, limit, status } = request.query;
	const userId = request.appUser!._id;
	const Thread = getThreadModel();

	const filter: Record<string, unknown> = { userId };
	if (status) {
		filter.status = status;
	} else {
		filter.status = { $ne: "closed" };
	}

	const total = await Thread.countDocuments(filter);
	const paginator = getPaginator(limit, page, total);
	const threads = await Thread.find(filter)
		.sort({ updatedAt: -1 })
		.skip(paginator.skip)
		.limit(paginator.limit)
		.lean();

	return paginatedResponse(threads.map(serializeThread), paginator);
}

export async function createThread(
	request: FastifyRequest<{ Body: CreateBody }>,
	reply: FastifyReply,
) {
	const { title } = request.body;
	const Thread = getThreadModel();

	const thread = await Thread.create({
		userId: request.appUser!._id,
		title: title || null,
	});

	reply.status(201);
	return successResponse(
		serializeThread(thread.toObject()),
		"Thread created",
		201,
	);
}

export async function getThread(
	request: FastifyRequest<{ Params: ThreadParams }>,
	_reply: FastifyReply,
) {
	const { id } = request.params;
	const Thread = getThreadModel();
	const Message = getMessageModel();

	const thread = await Thread.findById(id).lean();
	if (!thread) throw new NotFoundError("Thread not found");
	assertThreadOwnership(thread, request.appUser!);

	const messages = await Message.find({ threadId: thread._id })
		.sort({ createdAt: 1 })
		.lean();

	return successResponse({
		...serializeThread(thread),
		messages: messages.map(serializeMessage),
	});
}

export async function updateThread(
	request: FastifyRequest<{ Params: ThreadParams; Body: UpdateBody }>,
	_reply: FastifyReply,
) {
	const { id } = request.params;
	const { title } = request.body;
	const Thread = getThreadModel();

	const thread = await Thread.findById(id);
	if (!thread) throw new NotFoundError("Thread not found");
	assertThreadOwnership(thread, request.appUser!);

	thread.title = title;
	await thread.save();

	return successResponse(serializeThread(thread.toObject()));
}

export async function closeThread(
	request: FastifyRequest<{ Params: ThreadParams }>,
	_reply: FastifyReply,
) {
	const { id } = request.params;
	const Thread = getThreadModel();

	const thread = await Thread.findById(id);
	if (!thread) throw new NotFoundError("Thread not found");
	assertThreadOwnership(thread, request.appUser!);

	thread.status = "closed";
	await thread.save();

	return successResponse(null, "Thread closed");
}
