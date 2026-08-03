import Link from "next/link";

/**
 * Landing page for the backend service.
 *
 * Replaces the create-next-app template, which was still the first thing anyone
 * hitting the API host saw. Its job now is simply to point a human at the
 * console and remind them the rest of this service is a JSON API.
 */
export default function Home() {
    return (
        <div className="flex flex-1 items-center justify-center bg-slate-50 p-6 font-sans">
            <main className="w-full max-w-md text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
                    M
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    MGM Maintenance
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    Backend service for the campus complaint management system. Staff
                    report issues from the mobile app; managers and admins run things
                    from the console.
                </p>

                <Link
                    href="/console"
                    className="mt-7 inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
                >
                    Open the admin console
                </Link>

                <p className="mt-8 text-xs text-slate-400">
                    API endpoints live under{" "}
                    <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-slate-600">
                        /api
                    </code>
                </p>
            </main>
        </div>
    );
}
