import type { Metadata } from "next";
import AuthProvider from "./AuthProvider";

export const metadata: Metadata = {
    title: "MGM Admin Console",
    description: "Manage accounts, campus infrastructure and maintenance spend.",
};

/**
 * Wraps every `/console` route in the auth context.
 *
 * Stays a Server Component and renders the client provider around `children`,
 * per the context-provider pattern in the Next.js docs — this keeps the layout
 * itself out of the client bundle.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
                {children}
            </div>
        </AuthProvider>
    );
}
