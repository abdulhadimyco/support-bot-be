
// ─── Subscription Cluster ────────────────────────────────────────────

export const SUBSCRIPTION_DB = "subscription";

export const SUBSCRIPTION_COLLECTIONS = {
	CHECKOUT_SESSIONS: "checkoutsessions",
	SUBSCRIPTIONS: "subscriptions",
	LICENSES: "licenses",
	RECEIPTS: "reciepts",
} as const;

// ─── Production Cluster ──────────────────────────────────────────────

export const USER_DB = "user";
export const ENGAGEMENT_DB = "engagement";
export const VIDEO_DB = "video";
export const REFERENCE_DB = "reference";
export const TICKET_MANAGEMENT_DB = "ticket-management";

export const USER_COLLECTIONS = {
	USERS: "users",
	DEVICE_TOKENS: "devicetokens",
	SESSIONS: "sessions",
	USER_MODULES: "usermodules",
} as const;

export const ENGAGEMENT_COLLECTIONS = {
	VIEWS: "views",
	LIVE_VIDEO_VIEWS: "livevideoviews",
	CHANNELS: "channels",
	COMMENTS: "comments",
	LIKES: "likes",
	SHARES: "shares",
	WATCHLISTS: "watchlists",
	CONTINUE_WATCHINGS: "continuewatchings",
	SUBSCRIPTIONS: "subscriptions",
	IMPRESSIONS: "impressions",
	AGGREGATE_VIEWS: "aggregateviews",
	AGGREGATE_LIKES: "aggregatelikes",
	AGGREGATE_COMMENTS: "aggregatecomments",
	AGGREGATE_SUBSCRIBERS: "aggregatesubscribers",
} as const;

export const VIDEO_COLLECTIONS = {
	VIDEO_METADATAS: "videometadatas",
	CHANNELS: "channels",
	CATEGORIES: "categories",
	SERIES: "series",
	PLAYLISTS: "playlists",
} as const;

export const REFERENCE_COLLECTIONS = {
	COUNTRIES: "countries",
	LABELS: "labels",
	LABEL_SETS: "labelsets",
	LANGUAGES: "languages",
	PARTNERS: "partners",
	BANNERS: "banners",
	PAGES: "pages",
	HOMEPAGE_LISTS: "homepagelists",
	TEMPLATES: "templates",
	TAGS: "tags",
	REGIONS: "regions",
} as const;

export const TICKET_MANAGEMENT_COLLECTIONS = {
	EVENTS: "events",
	TICKETS: "tickets",
	TICKET_TYPES: "tickettypes",
} as const;

// ─── Payments PostgreSQL ─────────────────────────────────────────────

export const PG_TABLES = {
	TRANSACTIONS: "transactions",
	CHECKOUTS: "checkouts",
	USERS: "users",
} as const;

export const PG_VENDORS = {
	PKR: "70918844-f512-4ce5-b20b-16f828637662",
	STRIPE: "35a0e8b1-36f6-4d8e-b557-a48b34fdaa72",
} as const;

// ─── Allowlists (derived from above) ────────────────────────────────

export const SUBSCRIPTION_CLUSTER_ALLOWLIST: Record<string, readonly string[]> = {
	[SUBSCRIPTION_DB]: Object.values(SUBSCRIPTION_COLLECTIONS),
};

export const PRODUCTION_CLUSTER_ALLOWLIST: Record<string, readonly string[]> = {
	[USER_DB]: Object.values(USER_COLLECTIONS),
	[ENGAGEMENT_DB]: Object.values(ENGAGEMENT_COLLECTIONS),
	[VIDEO_DB]: Object.values(VIDEO_COLLECTIONS),
	[REFERENCE_DB]: Object.values(REFERENCE_COLLECTIONS),
	[TICKET_MANAGEMENT_DB]: Object.values(TICKET_MANAGEMENT_COLLECTIONS),
};

export const PG_TABLE_ALLOWLIST = new Set(Object.values(PG_TABLES));
