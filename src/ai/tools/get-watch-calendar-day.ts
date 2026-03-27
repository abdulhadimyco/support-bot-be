import { z } from "zod";
import { Types } from "mongoose";
import { getProductionClusterDb } from "../../lib/production-database";
import {
	ENGAGEMENT_DB,
	ENGAGEMENT_COLLECTIONS,
	VIDEO_DB,
	VIDEO_COLLECTIONS,
} from "../../constants/databases";
import { toIso, toHexString } from "./helpers";
import { toolError, ToolErrorCode, toolLogger } from "./errors";

const parameters = z.object({
	user_id: z.union([z.string(), z.number()]).describe("Customer user ID"),
	year: z.number().describe("Year"),
	month: z.number().min(1).max(12).describe("Month (1-12)"),
	day: z.number().min(1).max(31).describe("Day of month"),
});

interface NormalizedView {
	type: "live" | "vod";
	video_id: string;
	view_seconds: number;
	view_count: number;
	client: string | null;
}

interface VideoEntry {
	video_title: string | null;
	type: "live" | "vod";
	video_id: string;
	view_seconds: number;
	view_count: number;
	client: string | null;
}

async function execute(params: z.infer<typeof parameters>) {
	const { user_id, year, month, day } = params;

	const db = getProductionClusterDb(ENGAGEMENT_DB);
	if (!db) return toolError(ToolErrorCode.DB_UNAVAILABLE, "Engagement database not connected.", "getWatchCalendarDay");

	// Build user ID variants for query
	const userKey = String(user_id);
	const variants: unknown[] = [userKey];
	if (/^\d+$/.test(userKey)) variants.push(Number(userKey));
	if (/^[a-fA-F0-9]{24}$/.test(userKey)) {
		try { variants.push(new Types.ObjectId(userKey)); } catch { /* ignore */ }
	}
	const userMatch = variants.length === 1 ? variants[0] : { $in: variants };

	// Build date range for the specific day
	const startDate = new Date(year, month - 1, day);
	const endDate = new Date(year, month - 1, day + 1);

	const query = { userId: userMatch, createdOn: { $gte: startDate, $lt: endDate } };

	// Query both collections in parallel
	const [liveViews, vodViews] = await Promise.all([
		db.collection(ENGAGEMENT_COLLECTIONS.LIVE_VIDEO_VIEWS).find(query).sort({ createdOn: -1 }).limit(500).toArray(),
		db.collection(ENGAGEMENT_COLLECTIONS.VIEWS).find(query).sort({ createdOn: -1 }).limit(500).toArray(),
	]);

	// Normalize entries
	const normalized: NormalizedView[] = [];

	for (const doc of liveViews) {
		const r = doc as Record<string, unknown>;
		const videoId = toHexString(r.videoId) || toHexString(r.video_id) || toHexString(r._id);
		if (!videoId) continue;
		normalized.push({
			type: "live",
			video_id: videoId,
			view_seconds: Number(r.viewSeconds || r.accumulatedViewSeconds || 0) || 0,
			view_count: 1,
			client: typeof r.client === "string" ? r.client : null,
		});
	}

	for (const doc of vodViews) {
		const r = doc as Record<string, unknown>;
		const videoId = toHexString(r.videoId) || toHexString(r.video_id) || toHexString(r._id);
		if (!videoId) continue;
		normalized.push({
			type: "vod",
			video_id: videoId,
			view_seconds: Number(r.viewSeconds || r.accumulatedViewSeconds || 0) || 0,
			view_count: 1,
			client: typeof r.client === "string" ? r.client : null,
		});
	}

	// Collect unique video IDs for title lookup
	const uniqueVideoIds = [...new Set(normalized.map((v) => v.video_id))];
	const videoTitleMap = new Map<string, string | null>();

	if (uniqueVideoIds.length > 0) {
		const videoDB = getProductionClusterDb(VIDEO_DB);
		if (videoDB) {
			try {
				const objectIds = uniqueVideoIds
					.filter((id) => /^[a-fA-F0-9]{24}$/.test(id))
					.map((id) => new Types.ObjectId(id));

				if (objectIds.length > 0) {
					const metadatas = await videoDB
						.collection(VIDEO_COLLECTIONS.VIDEO_METADATAS)
						.find(
							{ _id: { $in: objectIds } },
							{ projection: { _id: 1, title: 1 } },
						)
						.toArray();

					for (const meta of metadatas) {
						const id = toHexString(meta._id);
						if (id) videoTitleMap.set(id, (meta.title as string) || null);
					}
				}
			} catch (e) {
				toolLogger.error({ err: e }, "Video metadata lookup failed in getWatchCalendarDay");
			}
		}
	}

	// Dedup by video_id + type, aggregate view_seconds and view_count
	const dedupMap = new Map<string, { type: "live" | "vod"; video_id: string; view_seconds: number; view_count: number; client: string | null }>();

	for (const entry of normalized) {
		const dedupKey = `${entry.video_id}:${entry.type}`;
		const existing = dedupMap.get(dedupKey);
		if (existing) {
			existing.view_seconds += entry.view_seconds;
			existing.view_count += entry.view_count;
			if (!existing.client && entry.client) existing.client = entry.client;
		} else {
			dedupMap.set(dedupKey, {
				type: entry.type,
				video_id: entry.video_id,
				view_seconds: entry.view_seconds,
				view_count: entry.view_count,
				client: entry.client,
			});
		}
	}

	// Sort by view_seconds desc
	const sorted = [...dedupMap.values()].sort((a, b) => b.view_seconds - a.view_seconds);

	const videos: VideoEntry[] = sorted.map((e) => ({
		video_title: videoTitleMap.get(e.video_id) ?? null,
		type: e.type,
		video_id: e.video_id,
		view_seconds: e.view_seconds,
		view_count: e.view_count,
		client: e.client,
	}));

	const totalSeconds = videos.reduce((sum, v) => sum + v.view_seconds, 0);

	return {
		user_id: String(user_id),
		year,
		month,
		day,
		total_entries: videos.length,
		total_seconds: totalSeconds,
		videos,
	};
}

export const getWatchCalendarDay = {
	description: "Get detailed viewing activity for a specific day.",
	parameters,
	execute,
};
