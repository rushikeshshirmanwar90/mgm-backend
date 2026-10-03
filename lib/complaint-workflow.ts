/**
 * The complaint lifecycle, in one place.
 *
 *   pending ──estimate──▶ awaiting_approval ──approve──▶ approved ──start──▶ in_progress
 *      ▲                        │                                               │
 *      └────────return──────────┘                                       work_done
 *                                                                               │
 *                                             resolved ◀──submit expenditure───┘
 *
 * The Estate Manager adds a category and an estimated budget, the Director
 * approves (or sends it back with a reason), the manager runs the work and then
 * records what it actually cost — which is what resolves the complaint.
 *
 * `on_hold` can interrupt any stage before work is done and resumes back into
 * whichever stage it paused. `rejected` is a legacy terminal state from before
 * this flow existed; nothing new is put into it, but old records still carry it.
 */

export const STATUSES = [
    "pending",
    "awaiting_approval",
    "approved",
    "in_progress",
    "work_done",
    "resolved",
    "on_hold",
    "rejected",
] as const;

export type ComplaintStatus = (typeof STATUSES)[number];

/** Stages a complaint can be put on hold from. */
export const HOLDABLE: ComplaintStatus[] = [
    "pending",
    "awaiting_approval",
    "approved",
    "in_progress",
];

export const COMPLAINT_CATEGORIES = [
    "electrical",
    "plumbing",
    "carpentry",
    "civil",
    "painting",
    "hvac",
    "cleaning",
    "it_network",
    "other",
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

/**
 * Expenditure line items. `rollup` folds each into the older three-way split
 * (labour / material / other) that the spending reports aggregate on, so those
 * keep working without having to know about every trade.
 */
export const COST_ITEMS = [
    { key: "electrician", rollup: "labor" },
    { key: "plumber", rollup: "labor" },
    { key: "carpenter", rollup: "labor" },
    { key: "mason", rollup: "labor" },
    { key: "painter", rollup: "labor" },
    { key: "hvac_technician", rollup: "labor" },
    { key: "general_labour", rollup: "labor" },
    { key: "materials", rollup: "material" },
    { key: "miscellaneous", rollup: "other" },
] as const;

export type CostItemKey = (typeof COST_ITEMS)[number]["key"];

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
    pending: "Complaint raised",
    awaiting_approval: "Awaiting director approval",
    approved: "Approved",
    in_progress: "In progress",
    work_done: "Work done",
    resolved: "Resolved",
    on_hold: "On hold",
    rejected: "Closed",
};
