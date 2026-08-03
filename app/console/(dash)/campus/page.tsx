"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../AuthProvider";
import { api, del, messageOf, post, put } from "@/lib/console/api";
import type {
    Building,
    BuildingResponse,
    BuildingsResponse,
    Floor,
    FloorResponse,
    FloorsResponse,
    Room,
    RoomsResponse,
} from "@/lib/console/types";
import {
    Badge,
    Button,
    Callout,
    Card,
    EmptyState,
    Field,
    Loading,
    Modal,
    PageHeader,
    SectionTitle,
    Select,
    icons,
} from "../../ui";

/** Mirrors the backend's default prefix per floor number. */
function defaultPrefixFor(n: number): string {
    return ["G", "F", "S", "T"][n] ?? `${n}F`;
}

function defaultNameFor(n: number): string {
    return (
        ["Ground Floor", "First Floor", "Second Floor", "Third Floor"][n] ?? `Floor ${n}`
    );
}

const ROOM_TYPES = ["classroom", "washroom", "lab", "office"] as const;

export default function CampusPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";

    const [buildings, setBuildings] = useState<Building[]>([]);
    const [building, setBuilding] = useState<Building | null>(null);
    const [floors, setFloors] = useState<Floor[]>([]);
    const [floor, setFloor] = useState<Floor | null>(null);
    const [rooms, setRooms] = useState<Room[]>([]);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Modal state — each form doubles as create and edit.
    const [bOpen, setBOpen] = useState(false);
    const [bEditing, setBEditing] = useState<Building | null>(null);
    const [bName, setBName] = useState("");
    const [bCode, setBCode] = useState("");

    const [fOpen, setFOpen] = useState(false);
    const [fEditing, setFEditing] = useState<Floor | null>(null);
    const [fName, setFName] = useState("");
    const [fNum, setFNum] = useState("0");
    const [fPrefix, setFPrefix] = useState("G");

    const [rOpen, setROpen] = useState(false);
    const [rType, setRType] = useState<string>("classroom");
    const [rCount, setRCount] = useState("3");

    const [rEditing, setREditing] = useState<Room | null>(null);
    const [erNumber, setErNumber] = useState("");
    const [erName, setErName] = useState("");

    const [formError, setFormError] = useState<string | null>(null);

    const [reloadToken, setReloadToken] = useState(0);
    /** Handlers call this after a mutation to re-run all three fetch effects. */
    const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

    // The three effects below deliberately update state only inside promise
    // continuations — a synchronous setState in an effect body causes a
    // cascading render and is rejected by react-hooks/set-state-in-effect.
    //
    // They also never clear state on the way out: floors are only rendered
    // under a selected building and rooms under a selected floor, so a stale
    // list is never visible, and the handlers that drop a selection clear the
    // dependent one themselves.

    useEffect(() => {
        let cancelled = false;

        api<BuildingsResponse>("/buildings")
            .then((data) => {
                if (cancelled) return;
                const list = data.buildings ?? [];
                setBuildings(list);
                // Keep the current selection if it survived the reload.
                setBuilding(
                    (cur) => (cur && list.find((b) => b._id === cur._id)) || list[0] || null
                );
                setError(null);
            })
            .catch((e) => {
                if (!cancelled) setError(messageOf(e, "Could not load buildings."));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    const buildingId = building?._id ?? null;

    useEffect(() => {
        if (!buildingId) return;
        let cancelled = false;

        api<FloorsResponse>(`/floors?buildingId=${buildingId}`)
            .then((data) => {
                if (cancelled) return;
                const list = data.floors ?? [];
                setFloors(list);
                setFloor(
                    (cur) => (cur && list.find((f) => f._id === cur._id)) || list[0] || null
                );
            })
            .catch((e) => {
                if (!cancelled) setError(messageOf(e, "Could not load floors."));
            });

        return () => {
            cancelled = true;
        };
    }, [buildingId, reloadToken]);

    const floorId = floor?._id ?? null;

    useEffect(() => {
        if (!floorId) return;
        let cancelled = false;

        api<RoomsResponse>(`/rooms?floorId=${floorId}`)
            .then((data) => {
                if (!cancelled) setRooms(data.rooms ?? []);
            })
            .catch((e) => {
                if (!cancelled) setError(messageOf(e, "Could not load rooms."));
            });

        return () => {
            cancelled = true;
        };
    }, [floorId, reloadToken]);

    // ---- Buildings ----

    const saveBuilding = async () => {
        if (!bName.trim() || !bCode.trim()) {
            setFormError("Both a name and a code are required.");
            return;
        }
        setBusy(true);
        setFormError(null);
        try {
            const body = { name: bName.trim(), code: bCode.trim() };
            const res = bEditing
                ? await put<BuildingResponse>(`/buildings/${bEditing._id}`, body)
                : await post<BuildingResponse>("/buildings", body);
            setBOpen(false);
            if (bEditing) setBuilding(res.building);
            refresh();
        } catch (e) {
            setFormError(messageOf(e, "Could not save the building."));
        } finally {
            setBusy(false);
        }
    };

    const deleteBuilding = async (target: Building) => {
        if (
            !window.confirm(
                `Delete ${target.name}? Its floors and rooms go too. This cannot be undone.`
            )
        )
            return;

        setBusy(true);
        try {
            await del(`/buildings/${target._id}`);
            if (building?._id === target._id) {
                // Drop the dependent selection too, otherwise the rooms section
                // would keep rendering the deleted building's floor.
                setBuilding(null);
                setFloor(null);
            }
            refresh();
        } catch (e) {
            // The API refuses while complaints still reference it, and says how
            // many — surface that verbatim.
            setError(messageOf(e, "Could not delete the building."));
        } finally {
            setBusy(false);
        }
    };

    // ---- Floors ----

    const saveFloor = async () => {
        if (!building) return;
        if (!fName.trim()) {
            setFormError("A floor name is required.");
            return;
        }
        const floorNumber = Number.parseInt(fNum, 10);
        if (Number.isNaN(floorNumber) || floorNumber < 0) {
            setFormError("Floor number must be 0 or higher (0 is the ground floor).");
            return;
        }

        setBusy(true);
        setFormError(null);
        try {
            const body = {
                name: fName.trim(),
                floorNumber,
                prefix: fPrefix.trim().toUpperCase(),
            };
            if (fEditing) {
                const res = await put<FloorResponse>(`/floors/${fEditing._id}`, body);
                setFloor(res.floor);
            } else {
                await post<FloorResponse>("/floors", {
                    ...body,
                    buildingId: building._id,
                });
            }
            setFOpen(false);
            refresh();
        } catch (e) {
            setFormError(messageOf(e, "Could not save the floor."));
        } finally {
            setBusy(false);
        }
    };

    const deleteFloor = async (target: Floor) => {
        if (!window.confirm(`Delete ${target.name}? Every room on it goes too.`)) return;
        setBusy(true);
        try {
            await del(`/floors/${target._id}`);
            if (floor?._id === target._id) setFloor(null);
            refresh();
        } catch (e) {
            setError(messageOf(e, "Could not delete the floor."));
        } finally {
            setBusy(false);
        }
    };

    // ---- Rooms ----

    const createRooms = async () => {
        if (!floor) return;
        const count = Number.parseInt(rCount, 10);
        if (Number.isNaN(count) || count < 1 || count > 50) {
            setFormError("Enter a number between 1 and 50.");
            return;
        }

        setBusy(true);
        setFormError(null);
        try {
            await post<RoomsResponse>("/rooms", {
                floorId: floor._id,
                roomType: rType,
                count,
            });
            setROpen(false);
            refresh();
        } catch (e) {
            setFormError(messageOf(e, "Could not create the rooms."));
        } finally {
            setBusy(false);
        }
    };

    const saveRoom = async () => {
        if (!rEditing || !floor) return;
        if (!erNumber.trim()) {
            setFormError("Room number cannot be empty.");
            return;
        }
        setBusy(true);
        setFormError(null);
        try {
            await put(`/rooms/${rEditing._id}`, {
                roomNumber: erNumber.trim(),
                name: erName.trim(),
            });
            setREditing(null);
            refresh();
        } catch (e) {
            setFormError(messageOf(e, "Could not update the room."));
        } finally {
            setBusy(false);
        }
    };

    const deleteRoom = async (target: Room) => {
        if (!window.confirm(`Delete ${target.roomNumber}?`)) return;
        setBusy(true);
        try {
            await del(`/rooms/${target._id}`);
            refresh();
        } catch (e) {
            setError(messageOf(e, "Could not delete the room."));
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <Loading label="Loading campus" />;

    return (
        <>
            <PageHeader
                title="Campus"
                subtitle="Buildings, floors and rooms. Room numbers are generated from each floor's prefix — G-1, G-2, F-1 and so on."
                action={
                    <Button onClick={() => {
                        setBEditing(null);
                        setBName("");
                        setBCode("");
                        setFormError(null);
                        setBOpen(true);
                    }}>
                        {icons.plus}
                        Add building
                    </Button>
                }
            />

            {error && (
                <div className="mb-5">
                    <Callout tone="danger" title="Something went wrong">
                        {error}
                    </Callout>
                </div>
            )}

            {/* Breadcrumb makes the current drill-down position explicit. */}
            <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-400">Campus</span>
                {building && (
                    <>
                        <span className="text-slate-300">{icons.chevronRight}</span>
                        <span className="font-semibold text-slate-700">{building.name}</span>
                    </>
                )}
                {floor && (
                    <>
                        <span className="text-slate-300">{icons.chevronRight}</span>
                        <span className="font-semibold text-slate-700">{floor.name}</span>
                    </>
                )}
            </nav>

            {/* 1 — Buildings */}
            <SectionTitle>Buildings · {buildings.length}</SectionTitle>
            {buildings.length === 0 ? (
                <EmptyState
                    title="No buildings yet"
                    message="Add a building to start mapping the campus."
                />
            ) : (
                <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {buildings.map((b) => (
                        <PickerCard
                            key={b._id}
                            selected={building?._id === b._id}
                            title={b.name}
                            meta={b.code}
                            onSelect={() => setBuilding(b)}
                            onEdit={() => {
                                setBEditing(b);
                                setBName(b.name);
                                setBCode(b.code);
                                setFormError(null);
                                setBOpen(true);
                            }}
                            // DELETE /api/buildings/[id] is admin-only.
                            onDelete={isAdmin ? () => deleteBuilding(b) : undefined}
                            deleteHint={isAdmin ? undefined : "Admins only"}
                        />
                    ))}
                </div>
            )}

            {/* 2 — Floors */}
            {building && (
                <>
                    <SectionTitle
                        action={
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                    const next = floors.length;
                                    setFEditing(null);
                                    setFNum(String(next));
                                    setFName(defaultNameFor(next));
                                    setFPrefix(defaultPrefixFor(next));
                                    setFormError(null);
                                    setFOpen(true);
                                }}
                            >
                                {icons.plus}
                                Add floor
                            </Button>
                        }
                    >
                        Floors in {building.code} · {floors.length}
                    </SectionTitle>

                    {floors.length === 0 ? (
                        <EmptyState
                            title="No floors yet"
                            message="Add a ground floor (number 0, prefix G) to begin."
                        />
                    ) : (
                        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {floors.map((f) => (
                                <PickerCard
                                    key={f._id}
                                    selected={floor?._id === f._id}
                                    title={f.name}
                                    meta={`Prefix ${f.prefix}`}
                                    onSelect={() => setFloor(f)}
                                    onEdit={() => {
                                        setFEditing(f);
                                        setFName(f.name);
                                        setFNum(String(f.floorNumber));
                                        setFPrefix(f.prefix);
                                        setFormError(null);
                                        setFOpen(true);
                                    }}
                                    onDelete={() => deleteFloor(f)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* 3 — Rooms */}
            {floor && (
                <>
                    <SectionTitle
                        action={
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                    setRType("classroom");
                                    setRCount("3");
                                    setFormError(null);
                                    setROpen(true);
                                }}
                            >
                                {icons.plus}
                                Add rooms
                            </Button>
                        }
                    >
                        Rooms on {floor.name} · {rooms.length}
                    </SectionTitle>

                    {rooms.length === 0 ? (
                        <EmptyState
                            title="No rooms on this floor"
                            message="Use “Add rooms” to generate a numbered run."
                        />
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {rooms.map((r) => (
                                <Card key={r._id} className="p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-900">
                                                {r.roomNumber}
                                            </p>
                                            <p className="truncate text-xs capitalize text-slate-500">
                                                {r.name || r.roomType}
                                            </p>
                                        </div>
                                        <Badge tone="neutral">{r.roomType}</Badge>
                                    </div>
                                    <div className="mt-3 flex gap-3 border-t border-slate-100 pt-3">
                                        <IconAction
                                            label="Edit"
                                            onClick={() => {
                                                setREditing(r);
                                                setErNumber(r.roomNumber);
                                                setErName(r.name ?? "");
                                                setFormError(null);
                                            }}
                                        >
                                            {icons.edit}
                                        </IconAction>
                                        <IconAction
                                            label="Delete"
                                            danger
                                            onClick={() => deleteRoom(r)}
                                        >
                                            {icons.trash}
                                        </IconAction>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ---- Modals ---- */}

            <Modal
                open={bOpen}
                title={bEditing ? "Edit building" : "Add building"}
                subtitle="Buildings group the floors and rooms of your campus."
                onClose={() => setBOpen(false)}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setBOpen(false)}>
                            Cancel
                        </Button>
                        <Button loading={busy} onClick={saveBuilding}>
                            {bEditing ? "Save changes" : "Create building"}
                        </Button>
                    </>
                }
            >
                {formError && (
                    <Callout tone="danger" title="Check the form">
                        {formError}
                    </Callout>
                )}
                <Field
                    label="Building name"
                    value={bName}
                    onChange={setBName}
                    placeholder="e.g. Science Block B"
                    required
                />
                <Field
                    label="Building code"
                    value={bCode}
                    onChange={setBCode}
                    placeholder="e.g. SCI-B"
                    required
                />
            </Modal>

            <Modal
                open={fOpen}
                title={fEditing ? "Edit floor" : "Add floor"}
                subtitle="The prefix drives automatic room numbering."
                onClose={() => setFOpen(false)}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setFOpen(false)}>
                            Cancel
                        </Button>
                        <Button loading={busy} onClick={saveFloor}>
                            {fEditing ? "Save changes" : "Create floor"}
                        </Button>
                    </>
                }
            >
                {formError && (
                    <Callout tone="danger" title="Check the form">
                        {formError}
                    </Callout>
                )}
                <Field
                    label="Floor name"
                    value={fName}
                    onChange={setFName}
                    placeholder="e.g. Ground Floor"
                    required
                />
                <Field
                    label="Floor number"
                    hint="0 = ground"
                    type="number"
                    value={fNum}
                    onChange={setFNum}
                    required
                />
                <Field
                    label="Room prefix"
                    hint="G produces G-1, G-2…"
                    value={fPrefix}
                    onChange={setFPrefix}
                    required
                />
                {fEditing && rooms.length > 0 && (
                    <Callout tone="warning" title="Prefix is locked">
                        This floor already has rooms — the API rejects a prefix change
                        because their numbers would fall out of sync.
                    </Callout>
                )}
            </Modal>

            <Modal
                open={rOpen}
                title="Add rooms"
                subtitle="Generate a numbered run of rooms in one go."
                onClose={() => setROpen(false)}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setROpen(false)}>
                            Cancel
                        </Button>
                        <Button loading={busy} onClick={createRooms}>
                            Generate rooms
                        </Button>
                    </>
                }
            >
                {formError && (
                    <Callout tone="danger" title="Check the form">
                        {formError}
                    </Callout>
                )}
                <Select
                    label="Room type"
                    value={rType}
                    onChange={setRType}
                    options={ROOM_TYPES.map((t) => ({
                        value: t,
                        label: t.charAt(0).toUpperCase() + t.slice(1),
                    }))}
                />
                <Field
                    label="How many"
                    hint="1–50"
                    type="number"
                    value={rCount}
                    onChange={setRCount}
                    required
                />
                {floor && (
                    <Callout tone="brand" title="Numbering continues automatically">
                        New rooms follow the highest existing number on {floor.name},
                        using the {floor.prefix} prefix.
                    </Callout>
                )}
            </Modal>

            <Modal
                open={rEditing !== null}
                title="Edit room"
                subtitle="Rename a room or correct its number."
                onClose={() => setREditing(null)}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setREditing(null)}>
                            Cancel
                        </Button>
                        <Button loading={busy} onClick={saveRoom}>
                            Save changes
                        </Button>
                    </>
                }
            >
                {formError && (
                    <Callout tone="danger" title="Check the form">
                        {formError}
                    </Callout>
                )}
                <Field
                    label="Room number"
                    value={erNumber}
                    onChange={setErNumber}
                    required
                />
                <Field
                    label="Display name"
                    hint="optional"
                    value={erName}
                    onChange={setErName}
                    placeholder="e.g. Physics Lecture Hall"
                />
            </Modal>
        </>
    );
}

/** Selectable building/floor card with inline edit and delete. */
function PickerCard({
    selected,
    title,
    meta,
    onSelect,
    onEdit,
    onDelete,
    deleteHint,
}: {
    selected: boolean;
    title: string;
    meta: string;
    onSelect: () => void;
    onEdit: () => void;
    onDelete?: () => void;
    deleteHint?: string;
}) {
    return (
        <div
            className={`rounded-2xl border bg-white p-4 transition-colors ${
                selected ? "border-brand ring-2 ring-brand/20" : "border-slate-200"
            }`}
        >
            <button
                onClick={onSelect}
                className="w-full cursor-pointer text-left"
                aria-pressed={selected}
            >
                <p className="font-bold text-slate-900">{title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{meta}</p>
            </button>

            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
                <IconAction label="Edit" onClick={onEdit}>
                    {icons.edit}
                </IconAction>
                {onDelete ? (
                    <IconAction label="Delete" danger onClick={onDelete}>
                        {icons.trash}
                    </IconAction>
                ) : (
                    <span className="text-xs text-slate-400">{deleteHint}</span>
                )}
            </div>
        </div>
    );
}

function IconAction({
    children,
    label,
    onClick,
    danger = false,
}: {
    children: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex cursor-pointer items-center gap-1.5 text-xs font-semibold transition-colors ${
                danger
                    ? "text-slate-400 hover:text-red-600"
                    : "text-slate-400 hover:text-brand"
            }`}
        >
            {children}
            {label}
        </button>
    );
}
