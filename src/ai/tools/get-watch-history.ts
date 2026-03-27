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
	limit: z
		.number()
		.min(1)
		.max(200)
		.default(50)
		.optional()
		.describe("Max number of entries to return (default 50)"),
});

interface NormalizedView {
	type: "live" | "vod";
	video_id: string;
	video_title: string | null;
	watched_at: string | null;
	view_seconds: number;
	view_count: number;
	client: string | null;
	country: string | null;
}

async function execute(params: z.infer<typeof parameters>) {
	const { user_id, limit = 50 } = params;

	const db = getProductionClusterDb(ENGAGEMENT_DB);
	if (!db) return toolError(ToolErrorCode.DB_UNAVAILABLE, "Engagement database not connected.", "getWatchHistory");

	// Build user ID variants for query
	const userKey = String(user_id);
	const variants: unknown[] = [userKey];
	if (/^\d+$/.test(userKey)) variants.push(Number(userKey));
	if (/^[a-fA-F0-9]{24}$/.test(userKey)) {
		try { variants.push(new Types.ObjectId(userKey)); } catch { /* ignore */ }
	}
	const userMatch = variants.length === 1 ? variants[0] : { $in: variants };

	// Query both collections in parallel
	const [liveViews, vodViews] = await Promise.all([
		db.collection(ENGAGEMENT_COLLECTIONS.LIVE_VIDEO_VIEWS).find({ userId: userMatch }).sort({ createdOn: -1 }).limit(limit).toArray(),
		db.collection(ENGAGEMENT_COLLECTIONS.VIEWS).find({ userId: userMatch }).sort({ createdOn: -1 }).limit(limit).toArray(),
	]);

	// Normalize entries
	const normalizedLive: NormalizedView[] = [];
	for (const doc of liveViews) {
		const r = doc as Record<string, unknown>;
		const videoId = toHexString(r.videoId) || toHexString(r.video_id) || toHexString(r._id);
		if (!videoId) continue;
		normalizedLive.push({
			type: "live",
			video_id: videoId,
			video_title: null,
			watched_at: toIso(r.createdOn),
			view_seconds: Number(r.viewSeconds || r.accumulatedViewSeconds || 0) || 0,
			view_count: 1,
			client: (r.client as string) || null,
			country: (r.country as string) || null,
		});
	}

	const normalizedVod: NormalizedView[] = [];
	for (const doc of vodViews) {
		const r = doc as Record<string, unknown>;
		const videoId = toHexString(r.videoId) || toHexString(r.video_id) || toHexString(r._id);
		if (!videoId) continue;
		normalizedVod.push({
			type: "vod",
			video_id: videoId,
			video_title: null,
			watched_at: toIso(r.createdOn),
			view_seconds: Number(r.viewSeconds || r.accumulatedViewSeconds || 0) || 0,
			view_count: 1,
			client: (r.client as string) || null,
			country: (r.country as string) || null,
		});
	}

	// Merge and sort by watched_at descending
	const allViews: NormalizedView[] = [...normalizedLive, ...normalizedVod].sort((a, b) => {
		const aTime = a.watched_at ? new Date(a.watched_at).getTime() : 0;
		const bTime = b.watched_at ? new Date(b.watched_at).getTime() : 0;
		return bTime - aTime;
	});

	// Collect unique video IDs for title lookup
	const uniqueVideoIds = [...new Set(allViews.map((v) => v.video_id))];
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
				toolLogger.error({ err: e }, "Video metadata lookup failed in getWatchHistory");
			}
		}
	}

	// Apply video titles
	for (const view of allViews) {
		view.video_title = videoTitleMap.get(view.video_id) ?? null;
	}

	// Compute totals
	const totalViewCount = allViews.reduce((sum, v) => sum + v.view_count, 0);
	const totalViewSeconds = allViews.reduce((sum, v) => sum + v.view_seconds, 0);

	return {
		source: "mongo_engagement",
		user_id: String(user_id),
		live_views_count: normalizedLive.length,
		vod_views_count: normalizedVod.length,
		total_entries: allViews.length,
		total_view_count: totalViewCount,
		total_view_seconds: totalViewSeconds,
		total_view_minutes: Math.round(totalViewSeconds / 60),
		views: allViews.slice(0, limit),
	};
}

export const getWatchHistory = {
	description: "Get recent watch history for a customer. Returns a flat list of viewed videos sorted by most recent first.",
	parameters,
	execute,
};
