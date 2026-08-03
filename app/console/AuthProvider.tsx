"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { api, clearToken, post, setToken } from "@/lib/console/api";
import type { ConsoleUser, LoginResponse, MeResponse } from "@/lib/console/types";

interface AuthState {
    user: ConsoleUser | null;
    /** True until the stored token has been checked against the server. */
    loading: boolean;
    signIn: (email: string, password: string) => Promise<ConsoleUser>;
    signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<ConsoleUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Tokens last 7 days, so a stored one may name a role the account no longer
    // has. /api/auth/me re-reads the user from the database, which makes it the
    // point where revoked access actually takes effect.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { user: fresh } = await api<MeResponse>("/auth/me");
                if (!cancelled) setUser(fresh);
            } catch {
                clearToken();
                if (!cancelled) setUser(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        const res = await post<LoginResponse>("/auth/login", { email, password });
        setToken(res.token);
        setUser(res.user);
        return res.user;
    }, []);

    const signOut = useCallback(() => {
        clearToken();
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({ user, loading, signIn, signOut }),
        [user, loading, signIn, signOut]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
