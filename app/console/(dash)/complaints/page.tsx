"use client";

import { useEffect, useMemo, useState } from "react";
import { api, messageOf } from "@/lib/console/api";
import {
    inr,
    nameOf,
    idOf,
    type Building,
    type BuildingsResponse,
    type Complaint,
    type ComplaintsResponse,
} from "@/lib/console/types";
import {
    Badge,
    Callout,
    Card,
    EmptyState,
    FilterTabs,
    Loading,
    PageHeader,
    SearchInput,
    SectionTitle,
    StatTile,
    StatusBadge,
} from "../../ui";

type StatusFilter = "all" | "pending" | "in_progress" | "resolved" | "rejected";

const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Needs action" },
    { key: "in_progress", label: "In progress" },
    { key: "resolved", label: "Resolved" },
    { key: "rejected", label: "Closed" },
];

const PRIORITY_TONE = {
    low: "neutral",
    medium: "warning",
    high: "warning",
    critical: "danger",
} as const;

interface Bucket {
    label: string;
    total: number;
    count: number;
}

export default function ComplaintsPage() {
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [status, setStatus] = useState<StatusFilter>("all");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State is only updated in the promise continuations — a synchronous
    // setState in the effect body is rejected by react-hooks/set-state-in-effect.
    useEffect(() => {
        let cancelled = false;

        Promise.all([
            api<ComplaintsResponse>(
                status === "all" ? "/complaints" : `/complaints?status=${status}`
            ),
            api<BuildingsResponse>("/buildings"),
        ])
            .then(([c, b]) => {
                if (cancelled) return;
                setComplaints(c.complaints ?? []);
                setBuildings(b.buildings ?? []);
                setError(null);
            })
            .catch((e) => {
                if (!cancelled) setError(messageOf(e, "Could not load complaints."));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [status]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return complaints;

        return complaints.filter((c) =>
            [
                c.title,
                c.description,
                c.locationType,
                c.priority,
                nameOf(typeof c.buildingId === "object" ? c.buildingId : undefined, ""),
                nameOf(typeof c.raisedBy === "object" ? c.raisedBy : undefined, ""),
                typeof c.roomId === "object" ? c.roomId?.roomNumber : "",
            ]
                .filter(Boolean)
                .some((f) => String(f).toLowerCase().includes(q))
        );
    }, [complaints, query]);

    // Totals follow what's on screen, so the headline can never disagree with
    // the list under it.
    const totals = useMemo(() => {
        let labor = 0;
        let material = 0;
        let other = 0;
        let costed = 0;

        for (const c of visible) {
            if (!c.costDetails) continue;
            costed += 1;
            labor += c.costDetails.laborCost || 0;
            material += c.costDetails.materialCost || 0;
            other += c.costDetails.otherCost || 0;
        }

        const total = labor + material + other;
        return {
            labor,
            material,
            other,
            total,
            costed,
            average: costed > 0 ? total / costed : 0,
        };
    }, [visible]);

    const byBuilding = useMemo<Bucket[]>(() => {
        const map = new Map<string, Bucket>();

        // Seed every known building so a zero row still appears — that is
        // information, not an omission.
        for (const b of buildings) {
            map.set(b._id, { label: b.name, total: 0, count: 0 });
        }

        for (const c of visible) {
            const key = idOf(c.buildingId) ?? "unknown";
            if (!map.has(key)) {
                map.set(key, {
                    label: nameOf(
                        typeof c.buildingId === "object" ? c.buildingId : undefined,
                        "Unassigned"
                    ),
                    total: 0,
                    count: 0,
                });
            }
            const bucket = map.get(key)!;
            bucket.count += 1;
            bucket.total += c.costDetails?.totalCost ?? 0;
        }

        return [...map.values()].sort((a, b) => b.total - a.total);
    }, [visible, buildings]);

    const peak = Math.max(...byBuilding.map((b) => b.total), 1);

    return (
        <>
            <PageHeader
                title="Complaints"
                subtitle="Every maintenance issue raised on campus, with what each repair cost."
            />

            {error && (
                <div className="mb-5">
                    <Callout tone="danger" title="Could not load">
                        {error}
                    </Callout>
                </div>
            )}

            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                    label="Spend in view"
                    value={inr(totals.total)}
                    tone="brand"
                    hint={`${totals.costed} costed`}
                />
                <StatTile label="Labor" value={inr(totals.labor)} />
                <StatTile label="Material" value={inr(totals.material)} />
                <StatTile
                    label="Average repair"
                    value={inr(totals.average)}
                    hint="Costed complaints only"
                />
            </div>

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <FilterTabs options={FILTERS} value={status} onChange={setStatus} />
                <div className="lg:w-72">
                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        placeholder="Search issue, place or reporter"
                    />
                </div>
            </div>

            {loading ? (
                <Loading label="Loading complaints" />
            ) : visible.length === 0 ? (
                <EmptyState
                    title={query ? "No matches" : "Nothing here"}
                    message={
                        query
                            ? `Nothing matches “${query}”.`
                            : "No complaints match this filter."
                    }
                />
            ) : (
                <>
                    <div className="mb-8 space-y-2.5">
                        {visible.map((c) => {
                            const building = nameOf(
                                typeof c.buildingId === "object" ? c.buildingId : undefined,
                                "Unknown building"
                            );
                            const floor = nameOf(
                                typeof c.floorId === "object" ? c.floorId : undefined,
                                ""
                            );
                            const room =
                                typeof c.roomId === "object" ? c.roomId?.roomNumber : null;
                            const reporter = nameOf(
                                typeof c.raisedBy === "object" ? c.raisedBy : undefined,
                                "Unknown"
                            );

                            return (
                                <Card key={c._id} className="p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-slate-900">
                                                {c.title}
                                            </p>
                                            <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">
                                                {c.description}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge tone={PRIORITY_TONE[c.priority]}>
                                                {c.priority}
                                            </Badge>
                                            <StatusBadge status={c.status} />
                                        </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                                        <span className="truncate">
                                            {building}
                                            {floor ? ` › ${floor}` : ""}
                                            {room ? ` › ${room}` : ""} · {reporter} ·{" "}
                                            {new Date(c.createdAt).toLocaleDateString(
                                                "en-IN",
                                                {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric",
                                                }
                                            )}
                                        </span>

                                        {c.costDetails && c.costDetails.totalCost > 0 ? (
                                            <span className="font-bold text-green-700">
                                                {inr(c.costDetails.totalCost)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400">
                                                No cost recorded
                                            </span>
                                        )}
                                    </div>

                                    {c.rejectionReason && (
                                        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                                            <span className="font-bold">
                                                Closed without repair:
                                            </span>{" "}
                                            {c.rejectionReason}
                                        </p>
                                    )}
                                </Card>
                            );
                        })}
                    </div>

                    <SectionTitle>Spend by building</SectionTitle>
                    <Card className="p-5">
                        <div className="space-y-4">
                            {byBuilding.map((b, i) => (
                                <div key={`${b.label}-${i}`}>
                                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                        <span className="truncate font-semibold text-slate-800">
                                            {b.label}
                                        </span>
                                        <span className="shrink-0 font-bold text-slate-900">
                                            {inr(b.total)}
                                        </span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className="h-full rounded-full bg-brand"
                                            style={{ width: `${(b.total / peak) * 100}%` }}
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">
                                        {b.count} complaint{b.count === 1 ? "" : "s"}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            )}
        </>
    );
}
