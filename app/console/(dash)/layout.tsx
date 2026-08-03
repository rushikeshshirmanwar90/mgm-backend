"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { Loading, icons } from "../ui";

const NAV = [
    { href: "/console", label: "Overview", icon: icons.grid },
    { href: "/console/complaints", label: "Complaints", icon: icons.clipboard },
    { href: "/console/campus", label: "Campus", icon: icons.building },
    { href: "/console/people", label: "People", icon: icons.users },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, loading, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    // The API is the real access boundary — this guard only keeps people out of
    // a UI that would 403 on every request anyway.
    useEffect(() => {
        if (loading) return;
        if (!user || user.role === "staff") router.replace("/console/login");
    }, [loading, user, router]);

    if (loading) return <Loading label="Checking your session" />;
    if (!user || user.role === "staff") return null;

    const handleSignOut = () => {
        signOut();
        router.replace("/console/login");
    };

    return (
        <div className="flex min-h-screen flex-col lg:flex-row">
            {/* Sidebar */}
            <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white lg:h-screen lg:w-64 lg:sticky lg:top-0 lg:border-b-0 lg:border-r">
                <div className="flex items-center gap-3 px-5 py-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
                        M
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                            MGM Console
                        </p>
                        <p className="text-xs capitalize text-slate-500">{user.role}</p>
                    </div>
                </div>

                <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
                    {NAV.map((item) => {
                        // `/console` would otherwise match every child route.
                        const active =
                            item.href === "/console"
                                ? pathname === "/console"
                                : pathname.startsWith(item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                                    active
                                        ? "bg-brand-light text-brand-dark"
                                        : "text-slate-600 hover:bg-slate-50"
                                }`}
                            >
                                <span className={active ? "text-brand" : "text-slate-400"}>
                                    {item.icon}
                                </span>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="hidden border-t border-slate-100 p-3 lg:block">
                    <div className="px-2 pb-3">
                        <p className="truncate text-sm font-semibold text-slate-800">
                            {user.name}
                        </p>
                        <p className="truncate text-xs text-slate-400">{user.email}</p>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                        <span className="text-slate-400">{icons.logout}</span>
                        Sign out
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-x-hidden">
                {/* Compact account bar for narrow screens, where the sidebar
                    collapses into a horizontal strip with no room for it. */}
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 lg:hidden">
                    <p className="truncate text-sm font-semibold text-slate-800">
                        {user.name}
                    </p>
                    <button
                        onClick={handleSignOut}
                        className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
                    >
                        {icons.logout}
                        Sign out
                    </button>
                </div>

                <div className="mx-auto max-w-6xl p-5 lg:p-8">{children}</div>
            </main>
        </div>
    );
}
