import type { FastifyRequest, FastifyReply } from "fastify";
import { s3Enabled, getPresignedUploadUrl, getPresignedViewUrl } from "../../lib/s3";
import { BadRequestError } from "../../lib/errors";

interface PresignUploadBody {
	mediaType: string;
	filename?: string;
}

interface PresignViewBody {
	key: string;
}

export async function handlePresignUpload(
	request: FastifyRequest<{ Body: PresignUploadBody }>,
	reply: FastifyReply,
) {
	const { mediaType, filename } = request.body;

	if (!mediaType) {
		throw new BadRequestError("mediaType is required");
	}

	if (!s3Enabled()) {
		request.log.warn("[R2] Presign upload requested but S3/R2 not configured");
		throw new BadRequestError("S3/R2 storage is not configured");
	}

	request.log.info({ mediaType, filename }, "[R2] Presign upload request");

	const { uploadUrl, key } = await getPresignedUploadUrl(mediaType, { filename });

	request.log.info({ key, mediaType, filename }, "[R2] Presign upload response sent to client");

	return reply.send({ uploadUrl, key });
}

export async function handlePresignView(
	request: FastifyRequest<{ Body: PresignViewBody }>,
	reply: FastifyReply,
) {
	const { key } = request.body;

	if (!key) {
		throw new BadRequestError("key is required");
	}

	if (!s3Enabled()) {
		request.log.warn("[R2] Presign view requested but S3/R2 not configured");
		throw new BadRequestError("S3/R2 storage is not configured");
	}

	request.log.info({ key }, "[R2] Presign view request");

	const viewUrl = await getPresignedViewUrl(key);

	request.log.info({ key }, "[R2] Presign view response sent to client");

	return reply.send({ url: viewUrl });
}
