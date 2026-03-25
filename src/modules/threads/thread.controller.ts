import type { FastifyReply, FastifyRequest } from "fastify";
import { getThreadModel, getMessageModel } from "../../db/models";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import {
	successResponse,
	paginatedResponse,
} from "../../utils/response.utils";
import { getPaginator } from "../../utils/pagination.utils";
import type {
	listThreadsQuerySchema,
	createThreadBodySchema,
	threadParamsSchema,
} from "./thread.schema";
import type { z } from "zod";

type ListQuery = z.infer<typeof listThreadsQuerySchema>;
type CreateBody = z.infer<typeof createThreadBodySchema>;
type ThreadParams = z.infer<typeof threadParamsSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeThread(doc: any) {
	return {
		id: String(doc._id),
		userId: String(doc.userId),
		customerEmail: null,
		customerName: null,
		summary: doc.title ?? null,
		status: doc.status,
		createdAt: doc.createdAt
			? (doc.createdAt as Date).toISOString()
			: undefined,
		updatedAt: doc.updatedAt
			? (doc.updatedAt as Date).toISOString()
			: undefined,
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMessage(doc: any) {
	return {
		id: String(doc._id),
		threadId: String(doc.threadId),
		role: doc.role,
		content: doc.content,
		metadata: doc.metadata ?? null,
		createdAt: doc.createdAt
			? (doc.createdAt as Date).toISOString()
			: undefined,
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
	return successResponse(serializeThread(thread.toObject()), "Thread created", 201);
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
	if (String(thread.userId) !== String(request.appUser!._id)) {
		throw new ForbiddenError("Not your thread");
	}

	const messages = await Message.find({ threadId: thread._id })
		.sort({ createdAt: 1 })
		.lean();

	return successResponse({
		...serializeThread(thread),
		messages: messages.map(serializeMessage),
	});
}

export async function deleteThread(
	request: FastifyRequest<{ Params: ThreadParams }>,
	_reply: FastifyReply,
) {
	const { id } = request.params;
	const Thread = getThreadModel();

	const thread = await Thread.findById(id);
	if (!thread) throw new NotFoundError("Thread not found");
	if (String(thread.userId) !== String(request.appUser!._id)) {
		throw new ForbiddenError("Not your thread");
	}

	thread.status = "closed";
	await thread.save();

	return successResponse(null, "Thread closed");
}
