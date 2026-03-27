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

const DEFAULT_MONTHS = 6;

const parameters = z.object({
	user_id: z.union([z.string(), z.number()]).describe("Customer user ID"),
	year: z.number().describe("Year (e.g. 2026)"),
	month: z.number().min(1).max(12).describe("Month (1-12) — calendar starts from this month and goes back"),
	months_back: z.number().min(1).max(12).default(DEFAULT_MONTHS).optional().describe("How many months of history to fetch (default 6, max 12)"),
});

interface NormalizedView {
	type: "live" | "vod";
	video_id: string;
	watched_at: string | null;
	view_seconds: number;
	view_count: number;
}

interface TopVideo {
	video_title: string | null;
	type: "live" | "vod";
	video_id: string;
	view_seconds: number;
	view_count: number;
}

interface DaySummary {
	day: number;
	live_count: number;
	vod_count: number;
	total_seconds: number;
	total_entries: number;
	top_videos: TopVideo[];
}

interface MonthSummary {
	year: number;
	month: number;
	active_days: number;
	live_count: number;
	vod_count: number;
	live_seconds: number;
	vod_seconds: number;
	total_seconds: number;
	days: DaySummary[];
}

function buildUserVariants(user_id: string | number) {
	const userKey = String(user_id);
	const variants: unknown[] = [userKey];
	if (/^\d+$/.test(userKey)) variants.push(Number(userKey));
	if (/^[a-fA-F0-9]{24}$/.test(userKey)) {
		try { variants.push(new Types.ObjectId(userKey)); } catch { /* ignore */ }
	}
	return variants.length === 1 ? variants[0] : { $in: variants };
}

function normalizeDoc(doc: Record<string, unknown>, type: "live" | "vod"): NormalizedView | null {
	const videoId = toHexString(doc.videoId) || toHexString(doc.video_id) || toHexString(doc._id);
	if (!videoId) return null;
	return {
		type,
		video_id: videoId,
		watched_at: toIso(doc.createdOn),
		view_seconds: Number(doc.viewSeconds || doc.accumulatedViewSeconds || 0) || 0,
		view_count: 1,
	};
}

function buildMonthSummary(
	year: number,
	month: number,
	entries: NormalizedView[],
	videoTitleMap: Map<string, string | null>,
): MonthSummary {
	// Group by day, dedup by video_id+type
	const dayMap = new Map<number, Map<string, { type: "live" | "vod"; video_id: string; view_seconds: number; view_count: number }>>();

	for (const entry of entries) {
		if (!entry.watched_at) continue;
		const day = new Date(entry.watched_at).getDate();
		if (!dayMap.has(day)) dayMap.set(day, new Map());
		const videosInDay = dayMap.get(day)!;
		const key = `${entry.video_id}:${entry.type}`;
		const existing = videosInDay.get(key);
		if (existing) {
			existing.view_seconds += entry.view_seconds;
			existing.view_count += entry.view_count;
		} else {
			videosInDay.set(key, { type: entry.type, video_id: entry.video_id, view_seconds: entry.view_seconds, view_count: entry.view_count });
		}
	}

	const days: DaySummary[] = [];
	let totalLiveCount = 0, totalVodCount = 0, totalLiveSeconds = 0, totalVodSeconds = 0;

	for (const day of [...dayMap.keys()].sort((a, b) => a - b)) {
		const vids = [...dayMap.get(day)!.values()];
		let dLive = 0, dVod = 0, dSec = 0;
		for (const e of vids) {
			if (e.type === "live") { dLive += e.view_count; totalLiveSeconds += e.view_seconds; }
			else { dVod += e.view_count; totalVodSeconds += e.view_seconds; }
			dSec += e.view_seconds;
		}
		totalLiveCount += dLive;
		totalVodCount += dVod;

		const topVideos: TopVideo[] = vids.sort((a, b) => b.view_seconds - a.view_seconds).slice(0, 5).map((e) => ({
			video_title: videoTitleMap.get(e.video_id) ?? null,
			type: e.type,
			video_id: e.video_id,
			view_seconds: e.view_seconds,
			view_count: e.view_count,
		}));

		days.push({ day, live_count: dLive, vod_count: dVod, total_seconds: dSec, total_entries: vids.length, top_videos: topVideos });
	}

	return {
		year, month,
		active_days: days.length,
		live_count: totalLiveCount, vod_count: totalVodCount,
		live_seconds: totalLiveSeconds, vod_seconds: totalVodSeconds,
		total_seconds: totalLiveSeconds + totalVodSeconds,
		days,
	};
}

async function execute(params: z.infer<typeof parameters>) {
	const { user_id, year, month, months_back } = params;
	const monthCount = months_back ?? DEFAULT_MONTHS;

	const db = getProductionClusterDb(ENGAGEMENT_DB);
	if (!db) return toolError(ToolErrorCode.DB_UNAVAILABLE, "Engagement database not connected.", "getWatchCalendarMonth");

	const userMatch = buildUserVariants(user_id);

	// Calculate N-month range ending at the specified month
	const endDate = new Date(year, month, 1); // first day of NEXT month
	const startDate = new Date(year, month - monthCount, 1);

	const query = { userId: userMatch, createdOn: { $gte: startDate, $lt: endDate } };

	const [liveViews, vodViews] = await Promise.all([
		db.collection(ENGAGEMENT_COLLECTIONS.LIVE_VIDEO_VIEWS).find(query).sort({ createdOn: -1 }).limit(10000).toArray(),
		db.collection(ENGAGEMENT_COLLECTIONS.VIEWS).find(query).sort({ createdOn: -1 }).limit(10000).toArray(),
	]);

	// Normalize all entries
	const allNormalized: NormalizedView[] = [];
	for (const doc of liveViews) {
		const n = normalizeDoc(doc as Record<string, unknown>, "live");
		if (n) allNormalized.push(n);
	}
	for (const doc of vodViews) {
		const n = normalizeDoc(doc as Record<string, unknown>, "vod");
		if (n) allNormalized.push(n);
	}

	// Batch video title lookup
	const uniqueVideoIds = [...new Set(allNormalized.map((v) => v.video_id))];
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
						.find({ _id: { $in: objectIds } }, { projection: { _id: 1, title: 1 } })
						.toArray();
					for (const meta of metadatas) {
						const id = toHexString(meta._id);
						if (id) videoTitleMap.set(id, (meta.title as string) || null);
					}
				}
			} catch (e) {
				toolLogger.error({ err: e }, "Video metadata lookup failed in getWatchCalendarMonth");
			}
		}
	}

	// Group entries by year-month, then build per-month summaries
	const byMonth = new Map<string, NormalizedView[]>();
	for (const entry of allNormalized) {
		if (!entry.watched_at) continue;
		const d = new Date(entry.watched_at);
		const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
		if (!byMonth.has(key)) byMonth.set(key, []);
		byMonth.get(key)!.push(entry);
	}

	// Build summaries for all requested months (including empty ones)
	const months: MonthSummary[] = [];
	for (let i = 0; i < monthCount; i++) {
		const d = new Date(year, month - monthCount + i, 1);
		const mYear = d.getFullYear();
		const mMonth = d.getMonth() + 1;
		const key = `${mYear}-${mMonth}`;
		const entries = byMonth.get(key) || [];
		months.push(buildMonthSummary(mYear, mMonth, entries, videoTitleMap));
	}

	return {
		user_id: String(user_id),
		current_year: year,
		current_month: month,
		months,
	};
}

export const getWatchCalendarMonth = {
	description: "Get a user's viewing activity for the last 6 months, aggregated by day for interactive calendar display. The calendar has built-in month navigation so call this ONCE.",
	parameters,
	execute,
};
