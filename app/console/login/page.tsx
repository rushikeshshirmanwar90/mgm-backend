"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { ConsoleApiError, messageOf } from "@/lib/console/api";
import { Button, Callout, Card, Field, Loading } from "../ui";

/**
 * The account the console signs in as.
 *
 * The console asks for a password only, so the email has to be pinned
 * somewhere — this is that one place. The password is *not* stored here: it is
 * whatever this account's password is in the database, checked by
 * `/api/auth/login` as normal, so real JWT auth and the `/api/auth/me`
 * re-validation both still apply.
 *
 * To point the console at a different admin, change this and re-run
 * `npm run set-console-password -- <new-email> <password>`.
 */
const CONSOLE_ACCOUNT_EMAIL = "admin@mgm.edu";

export default function ConsoleLoginPage() {
    const { user, loading, signIn } = useAuth();
    const router = useRouter();

    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [hint, setHint] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Already signed in (e.g. arrived here via the browser back button).
    useEffect(() => {
        if (!loading && user && user.role !== "staff") {
            router.replace("/console");
        }
    }, [loading, user, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setHint(null);
        setSubmitting(true);

        try {
            const signedIn = await signIn(CONSOLE_ACCOUNT_EMAIL, password);

            if (signedIn.role === "staff") {
                setError(
                    `${CONSOLE_ACCOUNT_EMAIL} is a staff account, so it cannot open the console.`
                );
                setSubmitting(false);
                return;
            }

            router.replace("/console");
        } catch (err) {
            setError(messageOf(err, "Could not sign in."));

            // A 401 here means either the password is wrong or the pinned
            // account doesn't exist yet — both are fixed the same way, so say so
            // rather than leaving someone guessing at a bare "Invalid
            // credentials".
            if (err instanceof ConsoleApiError && err.status === 401) {
                setHint(
                    `If ${CONSOLE_ACCOUNT_EMAIL} has not been set up yet, run "npm run set-console-password" in mgm-backend.`
                );
            }

            setSubmitting(false);
        }
    };

    if (loading) return <Loading label="Checking your session" />;

    return (
        <div className="flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
                        M
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        MGM Admin Console
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Accounts, campus setup and maintenance spend
                    </p>
                </div>

                <Card className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <Callout tone="danger" title="Sign-in failed">
                                {error}
                                {hint && <p className="mt-2 text-xs">{hint}</p>}
                            </Callout>
                        )}

                        <Field
                            label="Password"
                            type="password"
                            value={password}
                            onChange={setPassword}
                            placeholder="••••••••"
                        />

                        <Button
                            type="submit"
                            loading={submitting}
                            className="w-full"
                            disabled={!password}
                        >
                            Sign in
                        </Button>
                    </form>
                </Card>

                {/* Naming the account is deliberate: with no email box there is
                    otherwise no way to tell which admin you are acting as, and
                    the console attributes approvals and account creation to it. */}
                <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
                    Signs in as{" "}
                    <span className="font-semibold text-slate-500">
                        {CONSOLE_ACCOUNT_EMAIL}
                    </span>
                    . Staff report issues through the MGM mobile app.
                </p>
            </div>
        </div>
    );
}
