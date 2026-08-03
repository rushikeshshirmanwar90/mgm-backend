"use client";

import { useEffect } from "react";

/**
 * Small presentational kit for the console.
 *
 * Deliberately plain Tailwind with no component library, so the console adds no
 * dependencies to a backend whose job is serving the API.
 */

// ---- Layout ----

export function Card({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
        >
            {children}
        </div>
    );
}

export function PageHeader({
    title,
    subtitle,
    action,
}: {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
                {subtitle && (
                    <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>
                )}
            </div>
            {action}
        </div>
    );
}

export function SectionTitle({
    children,
    action,
}: {
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {children}
            </h2>
            {action}
        </div>
    );
}

// ---- Controls ----

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
    primary: "bg-brand text-white hover:bg-brand-dark border-transparent",
    secondary:
        "bg-brand-light text-brand-dark hover:bg-brand-border border-brand-border",
    danger: "bg-red-50 text-red-700 hover:bg-red-100 border-red-200",
    ghost: "bg-white text-slate-600 hover:bg-slate-50 border-slate-200",
};

export function Button({
    children,
    onClick,
    variant = "primary",
    type = "button",
    disabled = false,
    loading = false,
    size = "md",
    className = "",
}: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: ButtonVariant;
    type?: "button" | "submit";
    disabled?: boolean;
    loading?: boolean;
    size?: "sm" | "md";
    className?: string;
}) {
    const inert = disabled || loading;
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={inert}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors ${
                size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"
            } ${BUTTON_STYLES[variant]} ${
                inert ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            } ${className}`}
        >
            {loading && <Spinner small />}
            {children}
        </button>
    );
}

export function Field({
    label,
    hint,
    value,
    onChange,
    type = "text",
    placeholder,
    textarea = false,
    required = false,
}: {
    label: string;
    hint?: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
    textarea?: boolean;
    required?: boolean;
}) {
    const shared =
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

    return (
        <label className="block">
            <span className="mb-1.5 flex items-baseline gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    {label}
                </span>
                {required && <span className="text-xs text-red-500">required</span>}
                {hint && <span className="text-xs text-slate-400">{hint}</span>}
            </span>
            {textarea ? (
                <textarea
                    className={`${shared} min-h-24 resize-y`}
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)}
                />
            ) : (
                <input
                    className={shared}
                    type={type}
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
        </label>
    );
}

export function Select({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                {label}
            </span>
            <select
                className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function SearchInput({
    value,
    onChange,
    placeholder = "Search",
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                {icons.search}
            </span>
            <input
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}

export function FilterTabs<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { key: T; label: string }[];
    value: T;
    onChange: (key: T) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
                <button
                    key={o.key}
                    onClick={() => onChange(o.key)}
                    className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                        value === o.key
                            ? "border-brand-dark bg-brand text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

// ---- Feedback ----

type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

const TONE_STYLES: Record<Tone, string> = {
    brand: "bg-brand-light text-brand-dark border-brand-border",
    success: "bg-green-50 text-green-700 border-green-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Badge({
    children,
    tone = "neutral",
    dot = false,
}: {
    children: React.ReactNode;
    tone?: Tone;
    dot?: boolean;
}) {
    const dotColor: Record<Tone, string> = {
        brand: "bg-brand",
        success: "bg-green-500",
        warning: "bg-amber-500",
        danger: "bg-red-500",
        neutral: "bg-slate-400",
    };

    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_STYLES[tone]}`}
        >
            {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor[tone]}`} />}
            {children}
        </span>
    );
}

/** Complaint status pill, with the plain-language labels used app-wide. */
export function StatusBadge({
    status,
}: {
    status: "pending" | "in_progress" | "resolved" | "rejected";
}) {
    const map = {
        pending: { tone: "warning", label: "Needs action" },
        in_progress: { tone: "brand", label: "In progress" },
        resolved: { tone: "success", label: "Resolved" },
        rejected: { tone: "danger", label: "Closed" },
    } as const;

    const s = map[status];
    return (
        <Badge tone={s.tone} dot>
            {s.label}
        </Badge>
    );
}

export function Callout({
    tone = "brand",
    title,
    children,
}: {
    tone?: Tone;
    title: string;
    children?: React.ReactNode;
}) {
    return (
        <div className={`rounded-xl border px-4 py-3 text-sm ${TONE_STYLES[tone]}`}>
            <p className="font-bold">{title}</p>
            {children && <div className="mt-1 opacity-90">{children}</div>}
        </div>
    );
}

export function Spinner({ small = false }: { small?: boolean }) {
    return (
        <span
            className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${
                small ? "h-3.5 w-3.5" : "h-6 w-6"
            }`}
            aria-hidden
        />
    );
}

export function Loading({ label = "Loading" }: { label?: string }) {
    return (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
            <Spinner />
            <span className="text-sm font-medium">{label}…</span>
        </div>
    );
}

export function EmptyState({
    title,
    message,
    action,
}: {
    title: string;
    message?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="text-base font-bold text-slate-800">{title}</p>
            {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function StatTile({
    label,
    value,
    hint,
    tone = "neutral",
}: {
    label: string;
    value: string | number;
    hint?: string;
    tone?: Tone;
}) {
    const accent: Record<Tone, string> = {
        brand: "text-brand",
        success: "text-green-600",
        warning: "text-amber-600",
        danger: "text-red-600",
        neutral: "text-slate-900",
    };

    return (
        <Card className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {label}
            </p>
            <p className={`mt-2 text-2xl font-bold tracking-tight ${accent[tone]}`}>
                {value}
            </p>
            {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </Card>
    );
}

// ---- Modal ----

export function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
    footer,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) {
    // Escape closes the dialog, and the page behind it must not scroll while
    // it's open.
    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = previous;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/50"
                onClick={onClose}
                aria-hidden
            />
            <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                        {subtitle && (
                            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Close"
                    >
                        {icons.close}
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>

                {footer && (
                    <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

// ---- Icons ----
// Inline SVGs rather than an icon package, again to avoid a dependency.

const svg = (path: React.ReactNode, size = 16) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
    >
        {path}
    </svg>
);

export const icons = {
    grid: svg(
        <>
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </>
    ),
    users: svg(
        <>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
    ),
    building: svg(
        <>
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
        </>
    ),
    clipboard: svg(
        <>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" />
        </>
    ),
    plus: svg(<path d="M12 5v14M5 12h14" />),
    close: svg(<path d="M18 6 6 18M6 6l12 12" />, 18),
    search: svg(
        <>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </>
    ),
    logout: svg(
        <>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5M21 12H9" />
        </>
    ),
    trash: svg(
        <>
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </>
    ),
    edit: svg(
        <>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
        </>
    ),
    check: svg(<path d="M20 6 9 17l-5-5" />),
    chevronRight: svg(<path d="m9 18 6-6-6-6" />, 14),
};
