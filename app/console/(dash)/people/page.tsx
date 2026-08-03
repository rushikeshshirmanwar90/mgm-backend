"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthProvider";
import { api, del, messageOf, post, put } from "@/lib/console/api";
import type { ConsoleUser, Role, UsersResponse } from "@/lib/console/types";
import {
    Badge,
    Button,
    Callout,
    Card,
    EmptyState,
    Field,
    FilterTabs,
    Loading,
    Modal,
    PageHeader,
    SearchInput,
    Select,
    StatTile,
    icons,
} from "../../ui";

type FilterKey = "all" | "pending" | "staff" | "manager" | "admin" | "rejected";

const FILTERS: { key: FilterKey; label: string; query: string }[] = [
    { key: "all", label: "Everyone", query: "" },
    { key: "pending", label: "Awaiting approval", query: "?status=pending" },
    { key: "staff", label: "Staff", query: "?role=staff" },
    { key: "manager", label: "Managers", query: "?role=manager" },
    { key: "admin", label: "Admins", query: "?role=admin" },
    { key: "rejected", label: "Rejected", query: "?status=rejected" },
];

const ROLE_TONE: Record<Role, "brand" | "warning" | "success"> = {
    admin: "brand",
    manager: "warning",
    staff: "success",
};

const ROLE_BLURB: Record<Role, string> = {
    staff: "Reports maintenance issues from the mobile app. Needs approval before first sign-in — unless created here.",
    manager:
        "Reviews complaints, records repair costs and approves new staff registrations.",
    admin: "Full access, including creating other managers and admins and deleting buildings.",
};

export default function PeoplePage() {
    const { user: currentUser } = useAuth();
    const isAdmin = currentUser?.role === "admin";
    const currentUserId = currentUser?._id || currentUser?.id;

    const [users, setUsers] = useState<ConsoleUser[]>([]);
    const [filter, setFilter] = useState<FilterKey>("all");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    // The account form doubles as create and edit; `editing` decides which.
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<ConsoleUser | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [department, setDepartment] = useState("");
    const [phone, setPhone] = useState("");
    const [role, setRole] = useState<Role>("manager");

    const [reloadToken, setReloadToken] = useState(0);
    /** Handlers call this after a mutation to re-run the fetch effect. */
    const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

    // Every setState here runs in a promise continuation rather than in the
    // effect body. Calling it synchronously triggers a cascading render, which
    // the react-hooks/set-state-in-effect rule rejects.
    useEffect(() => {
        let cancelled = false;
        const q = FILTERS.find((f) => f.key === filter)?.query ?? "";

        api<UsersResponse>(`/users${q}`)
            .then((data) => {
                if (cancelled) return;
                setUsers(data.users ?? []);
                setError(null);
            })
            .catch((e) => {
                if (!cancelled) setError(messageOf(e, "Could not load accounts."));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [filter, reloadToken]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return users;
        return users.filter((u) =>
            [u.name, u.email, u.department, u.role]
                .filter(Boolean)
                .some((f) => String(f).toLowerCase().includes(q))
        );
    }, [users, query]);

    const counts = useMemo(
        () => ({
            total: users.length,
            pending: users.filter((u) => u.approvalStatus === "pending").length,
            managers: users.filter((u) => u.role === "manager").length,
            admins: users.filter((u) => u.role === "admin").length,
        }),
        [users]
    );

    const openCreate = () => {
        setEditing(null);
        setName("");
        setEmail("");
        setPassword("");
        setDepartment("");
        setPhone("");
        setRole("manager");
        setFormError(null);
        setModalOpen(true);
    };

    const openEdit = (target: ConsoleUser) => {
        setEditing(target);
        setName(target.name);
        setEmail(target.email);
        setPassword(""); // blank means "leave the current password alone"
        setDepartment(target.department ?? "");
        setPhone(target.phone ?? "");
        setRole(target.role);
        setFormError(null);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        setFormError(null);
    };

    const handleSave = async () => {
        if (!name.trim() || !email.trim()) {
            setFormError("Name and email are both required.");
            return;
        }
        // A password is mandatory when creating, optional when editing.
        if (!editing && !password) {
            setFormError("A temporary password is required for a new account.");
            return;
        }
        if (password && password.length < 6) {
            setFormError("Password must be at least 6 characters.");
            return;
        }

        setSaving(true);
        setFormError(null);
        try {
            const body: Record<string, unknown> = {
                name: name.trim(),
                email: email.trim(),
                department: department.trim(),
                phone: phone.trim(),
                role,
            };
            if (password) body.password = password;

            if (editing) {
                await put(`/users/${editing._id || editing.id}`, body);
            } else {
                await post("/users", body);
            }

            closeModal();
            refresh();
        } catch (e) {
            setFormError(messageOf(e, "Could not save the account."));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (target: ConsoleUser) => {
        if (
            !window.confirm(
                `Delete ${target.name}? This removes the account permanently. If they have raised complaints, reject the account instead so the record survives.`
            )
        ) {
            return;
        }

        const id = target._id || target.id!;
        setBusyId(id);
        try {
            await del(`/users/${id}`);
            refresh();
        } catch (e) {
            // The server refuses in several well-explained cases (last admin,
            // yourself, complaints still referencing them). Those messages are
            // the useful part, and an alert guarantees they're seen even when
            // the row is far down a long list.
            window.alert(messageOf(e, "Could not delete the account."));
        } finally {
            setBusyId(null);
        }
    };

    const handleReview = async (target: ConsoleUser, action: "approve" | "reject") => {
        if (
            action === "reject" &&
            !window.confirm(
                `Reject ${target.name}? They will not be able to sign in, and they drop out of the approval queue.`
            )
        ) {
            return;
        }

        const id = target._id || target.id!;
        setBusyId(id);
        try {
            await put(`/users/${id}/approve`, { action });
            refresh();
        } catch (e) {
            window.alert(messageOf(e, "Could not update the account."));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <>
            <PageHeader
                title="People"
                subtitle="Create, edit and remove accounts, and review staff who have signed up from the mobile app."
                action={
                    isAdmin ? (
                        <Button onClick={openCreate}>
                            {icons.plus}
                            New account
                        </Button>
                    ) : undefined
                }
            />

            {!isAdmin && (
                <div className="mb-6">
                    <Callout tone="warning" title="You are signed in as a manager">
                        Managers can approve or reject staff registrations. Creating,
                        editing and deleting accounts is restricted to admins.
                    </Callout>
                </div>
            )}

            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Accounts" value={counts.total} />
                <StatTile
                    label="Awaiting approval"
                    value={counts.pending}
                    tone={counts.pending > 0 ? "warning" : "neutral"}
                    hint={counts.pending > 0 ? "Needs your review" : "All reviewed"}
                />
                <StatTile label="Managers" value={counts.managers} />
                <StatTile label="Admins" value={counts.admins} />
            </div>

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />
                <div className="lg:w-72">
                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        placeholder="Search name, email or department"
                    />
                </div>
            </div>

            {error && (
                <div className="mb-4">
                    <Callout tone="danger" title="Could not load">
                        {error}
                    </Callout>
                </div>
            )}

            {loading ? (
                <Loading label="Loading accounts" />
            ) : visible.length === 0 ? (
                <EmptyState
                    title={query ? "No matches" : "No accounts in this view"}
                    message={
                        query
                            ? `Nothing matches “${query}”.`
                            : "Try a different filter above."
                    }
                />
            ) : (
                <div className="space-y-2.5">
                    {visible.map((u) => {
                        const id = u._id || u.id!;
                        const isPending = u.approvalStatus === "pending";
                        const isRejected = u.approvalStatus === "rejected";
                        const busy = busyId === id;
                        const isSelf = id === currentUserId;
                        // The API only lets managers/admins review staff accounts.
                        const reviewable = u.role === "staff" && (isPending || isRejected);

                        return (
                            <Card key={id} className="p-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                                            {u.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate font-bold text-slate-900">
                                                {u.name}
                                                {isSelf && (
                                                    <span className="ml-2 text-xs font-semibold text-slate-400">
                                                        you
                                                    </span>
                                                )}
                                            </p>
                                            <p className="truncate text-sm text-slate-500">
                                                {u.email}
                                            </p>
                                            {u.department && (
                                                <p className="truncate text-xs text-slate-400">
                                                    {u.department}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                                        <Badge
                                            tone={u.isEmailVerified ? "success" : "warning"}
                                            dot
                                        >
                                            {u.isEmailVerified
                                                ? "Email verified"
                                                : "Email unverified"}
                                        </Badge>
                                        <Badge
                                            tone={
                                                u.isApproved
                                                    ? "success"
                                                    : isRejected
                                                      ? "danger"
                                                      : "warning"
                                            }
                                            dot
                                        >
                                            {u.isApproved
                                                ? "Approved"
                                                : isRejected
                                                  ? "Rejected"
                                                  : "Pending approval"}
                                        </Badge>
                                    </div>
                                </div>

                                {(isAdmin || reviewable) && (
                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                                        <p className="text-xs text-slate-500">
                                            {reviewable && !u.isEmailVerified
                                                ? "Can't be approved until they confirm their email address."
                                                : reviewable
                                                  ? "They are emailed and notified in-app either way."
                                                  : isSelf
                                                    ? "You can't delete or change the role of the account you're signed in with."
                                                    : ""}
                                        </p>

                                        <div className="flex flex-wrap gap-2">
                                            {reviewable && isPending && (
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    disabled={busy}
                                                    onClick={() => handleReview(u, "reject")}
                                                >
                                                    Reject
                                                </Button>
                                            )}
                                            {reviewable && u.isEmailVerified && (
                                                <Button
                                                    size="sm"
                                                    loading={busy}
                                                    onClick={() => handleReview(u, "approve")}
                                                >
                                                    {icons.check}
                                                    {isRejected ? "Reinstate" : "Approve"}
                                                </Button>
                                            )}

                                            {isAdmin && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busy}
                                                    onClick={() => openEdit(u)}
                                                >
                                                    {icons.edit}
                                                    Edit
                                                </Button>
                                            )}
                                            {isAdmin && !isSelf && (
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    loading={busy}
                                                    onClick={() => handleDelete(u)}
                                                >
                                                    {icons.trash}
                                                    Delete
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            <Modal
                open={modalOpen}
                title={editing ? `Edit ${editing.name}` : "Create an account"}
                subtitle={
                    editing
                        ? "Changes take effect the next time they sign in."
                        : "Accounts made here skip email verification and the approval queue — the person can sign in straight away."
                }
                onClose={closeModal}
                footer={
                    <>
                        <Button variant="ghost" onClick={closeModal}>
                            Cancel
                        </Button>
                        <Button loading={saving} onClick={handleSave}>
                            {editing ? "Save changes" : `Create ${role}`}
                        </Button>
                    </>
                }
            >
                {formError && (
                    <Callout tone="danger" title="Check the form">
                        {formError}
                    </Callout>
                )}

                {editing && editing._id === currentUserId ? (
                    <Callout tone="warning" title="This is your own account">
                        You can update your details and password here, but the server
                        will refuse a role change on the account you are signed in with.
                    </Callout>
                ) : null}

                <Select
                    label="Role"
                    value={role}
                    onChange={(v) => setRole(v as Role)}
                    options={[
                        { value: "manager", label: "Manager" },
                        { value: "admin", label: "Admin" },
                        { value: "staff", label: "Staff" },
                    ]}
                />
                <p className="-mt-2 text-xs leading-relaxed text-slate-500">
                    {ROLE_BLURB[role]}
                </p>

                <Field label="Full name" value={name} onChange={setName} required />
                <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="name@mgm.edu"
                    required
                />
                <Field
                    label={editing ? "New password" : "Temporary password"}
                    type="password"
                    value={password}
                    onChange={setPassword}
                    hint={editing ? "leave blank to keep current" : "min 6 characters"}
                    required={!editing}
                    placeholder={editing ? "••••••••" : undefined}
                />
                <Field
                    label="Department"
                    hint="optional"
                    value={department}
                    onChange={setDepartment}
                    placeholder="e.g. Civil Engineering"
                />
                <Field
                    label="Phone"
                    hint="optional"
                    value={phone}
                    onChange={setPhone}
                    placeholder="9876543210"
                />

                {!editing && (
                    <Callout tone="brand" title="Share the password securely">
                        They sign in with this password immediately. There is no
                        password-reset email, so pass it on directly and ask them to
                        change it.
                    </Callout>
                )}
            </Modal>
        </>
    );
}
