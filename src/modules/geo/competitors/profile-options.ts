/** Values shared by the schema, the server and client forms. Free of database imports on purpose. */
export const PROFILE_LIMITS = { summary: 400, offering: 80, offerings: 10, targetCustomer: 200, servedArea: 120 } as const;

/** Who a competitor is to the business: same offer, other way of solving the need, or what is used instead. */
export const COMPETITOR_KINDS = ["direct", "indirect", "substitute"] as const;
export type CompetitorKind = (typeof COMPETITOR_KINDS)[number];

export const CUSTOMER_TYPES = ["b2b", "b2c", "both"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const ZONE_RELEVANCES = ["local", "regional", "national", "international"] as const;
export type ZoneRelevance = (typeof ZONE_RELEVANCES)[number];
