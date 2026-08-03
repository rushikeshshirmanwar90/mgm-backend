"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthProvider";
import { api, messageOf } from "@/lib/console/api";
import {
    inr,
    type BuildingsResponse,
    type Complaint,
    type ComplaintsResponse,
    type UsersResponse,
} from "@/lib/console/types";
import {
    Button,
    Callout,
    Card,
    Loading,
    PageHeader,
    SectionTitle,
    StatTile,
    StatusBadge,
    icons,
} from "../ui";

export default function OverviewPage() {
    const { user } = useAuth();

    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [buildingCount, setBuildingCount] = useState(0);
    const [pendingStaff, setPendingStaff] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State is only updated in the promise continuations — a synchronous
    // setState in the effect body is rejected by react-hooks/set-state-in-effect.
    useEffect(() => {
        let cancelled = false;

        Promise.all([
            api<ComplaintsResponse>("/complaints"),
            api<BuildingsResponse>("/buildings"),
            api<UsersResponse>("/users?status=pending"),
        ])
            .then(([c, b, u]) => {
                if (cancelled) return;
                setComplaints(c.complaints ?? []);
                setBuildingCount((b.buildings ?? []).length);
                setPendingStaff((u.users ?? []).length);
                setError(null);
            })
            .catch((e) => {
                if (!cancelled) setError(messageOf(e, "Could not load the overview."));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const stats = useMemo(() => {
        let labor = 0;
        let material = 0;
        let other = 0;
        let costed = 0;

        for (const c of complaints) {
            if (!c.costDetails) continue;
            costed += 1;
            labor += c.costDetails.laborCost || 0;
            material += c.costDetails.materialCost || 0;
            other += c.costDetails.otherCost || 0;
        }

        const count = (s: Complaint["status"]) =>
            complaints.filter((c) => c.status === s).length;

        return {
            labor,
            material,
            other,
            total: labor + material + other,
            costed,
            pending: count("pending"),
            inProgress: count("in_progress"),
            resolved: count("resolved"),
            rejected: count("rejected"),
        };
    }, [complaints]);

    if (loading) return <Loading label="Loading overview" />;

    const share = (part: number) => (stats.total > 0 ? (part / stats.total) * 100 : 0);

    return (
        <>
            <PageHeader
                title={`Welcome back, ${user?.name?.split(" ")[0] ?? ""}`.trim()}
                subtitle="A snapshot of campus maintenance activity and spend."
            />

            {error && (
                <div className="mb-5">
                    <Callout tone="danger" title="Could not load">
                        {error}
                    </Callout>
                </div>
            )}

            {pendingStaff > 0 && (
                <div className="mb-6">
                    <Callout
                        tone="warning"
                        title={`${pendingStaff} staff registration${pendingStaff === 1 ? "" : "s"} awaiting approval`}
                    >
                        <Link
                            href="/console/people"
                            className="mt-2 inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
                        >
                            Review them now {icons.chevronRight}
                        </Link>
                    </Callout>
                </div>
            )}

            {/* Spend headline */}
            <Card className="mb-6 overflow-hidden">
                <div className="bg-brand p-6 text-white">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/70">
                        Total repair spend
                    </p>
                    <p className="mt-2 text-4xl font-bold tracking-tight">
                        {inr(stats.total)}
                    </p>
                    <p className="mt-1 text-sm text-white/80">
                        Across {complaints.length} complaint
                        {complaints.length === 1 ? "" : "s"} · {stats.costed} with a
                        recorded cost
                    </p>
                </div>

                <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    {[
                        { label: "Labor", value: stats.labor },
                        { label: "Material", value: stats.material },
                        { label: "Other", value: stats.other },
                    ].map((row) => (
                        <div key={row.label} className="p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                {row.label}
                            </p>
                            <p className="mt-1 text-lg font-bold text-slate-900">
                                {inr(row.value)}
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="h-full rounded-full bg-brand"
                                    style={{ width: `${share(row.value)}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            <SectionTitle>Complaint status</SectionTitle>
            <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                    label="Needs action"
                    value={stats.pending}
                    tone={stats.pending > 0 ? "warning" : "neutral"}
                />
                <StatTile label="In progress" value={stats.inProgress} tone="brand" />
                <StatTile label="Resolved" value={stats.resolved} tone="success" />
                <StatTile label="Closed" value={stats.rejected} />
            </div>

            <SectionTitle
                action={
                    <Link href="/console/complaints">
                        <Button size="sm" variant="ghost">
                            View all {icons.chevronRight}
                        </Button>
                    </Link>
                }
            >
                Latest complaints
            </SectionTitle>

            <div className="mb-8 space-y-2.5">
                {complaints.slice(0, 5).map((c) => (
                    <Card key={c._id} className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                                {c.title}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                                {new Date(c.createdAt).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                })}
                            </p>
                        </div>
                        <StatusBadge status={c.status} />
                    </Card>
                ))}
                {complaints.length === 0 && (
                    <p className="text-sm text-slate-400">No complaints recorded yet.</p>
                )}
            </div>

            <SectionTitle>Campus</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
                <StatTile label="Buildings" value={buildingCount} />
                <StatTile
                    label="Awaiting approval"
                    value={pendingStaff}
                    tone={pendingStaff > 0 ? "warning" : "neutral"}
                />
            </div>
        </>
    );
}
