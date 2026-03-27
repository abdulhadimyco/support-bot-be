import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import pino from "pino";
import config from "../config/env";

const log = pino({ name: "r2-storage", level: config.LOG_LEVEL || "info" });

const UPLOAD_EXPIRES_IN = 300;
const VIEW_EXPIRES_IN = 3600;

let s3Client: S3Client | null = null;

export function s3Enabled(): boolean {
	const enabled = !!(config.S3_BUCKET && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY);
	return enabled;
}

function getClient(): S3Client {
	if (!s3Client) {
		log.info(
			{ endpoint: config.S3_ENDPOINT || "default", region: config.S3_REGION, bucket: config.S3_BUCKET },
			"[R2] Initializing S3 client",
		);
		s3Client = new S3Client({
			region: config.S3_REGION,
			...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT, forcePathStyle: true } : {}),
			credentials: {
				accessKeyId: config.S3_ACCESS_KEY_ID!,
				secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
			},
		});
	}
	return s3Client;
}

export async function getPresignedUploadUrl(
	mediaType: string,
	options?: { filename?: string; folder?: string },
): Promise<{ uploadUrl: string; key: string }> {
	const ext = mediaType.split("/")[1]?.split("+")[0] || "bin";
	const folder = options?.folder || "chat-attachments";
	const key = `${folder}/${randomUUID()}.${ext}`;

	log.info(
		{ key, mediaType, filename: options?.filename, bucket: config.S3_BUCKET, expiresIn: UPLOAD_EXPIRES_IN },
		"[R2] Generating presigned upload URL",
	);

	const command = new PutObjectCommand({
		Bucket: config.S3_BUCKET!,
		Key: key,
		ContentType: mediaType,
	});

	const uploadUrl = await getSignedUrl(getClient(), command, {
		expiresIn: UPLOAD_EXPIRES_IN,
	});

	log.info(
		{ key, uploadUrlLength: uploadUrl.length },
		"[R2] Presigned upload URL generated",
	);

	return { uploadUrl, key };
}

export async function getPresignedViewUrl(key: string): Promise<string> {
	if (config.S3_PUBLIC_URL) {
		const url = `${config.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
		log.debug({ key, url }, "[R2] Using public URL (no presigning)");
		return url;
	}

	log.info(
		{ key, bucket: config.S3_BUCKET, expiresIn: VIEW_EXPIRES_IN },
		"[R2] Generating presigned view URL",
	);

	const command = new GetObjectCommand({
		Bucket: config.S3_BUCKET!,
		Key: key,
	});

	const viewUrl = await getSignedUrl(getClient(), command, {
		expiresIn: VIEW_EXPIRES_IN,
	});

	log.info({ key, viewUrlLength: viewUrl.length }, "[R2] Presigned view URL generated");

	return viewUrl;
}
