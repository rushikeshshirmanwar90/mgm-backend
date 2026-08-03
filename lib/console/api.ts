const TOKEN_KEY = "mgm_console_token";

/**
 * Browser-side API client for the console.
 *
 * The API authenticates from the `Authorization: Bearer` header only
 * (`getTokenFromRequest` in lib/auth.ts) — it never reads cookies. That code is
 * shared with the mobile app, so rather than change it, the console keeps its
 * token in localStorage and attaches the header from the client. Every page is
 * therefore a Client Component; the API remains the security boundary, and the
 * console UI is only a shell over it.
 */

export class ConsoleApiError extends Error {
    status: number;
    payload: Record<string, unknown>;

    constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
        super(message);
        this.name = "ConsoleApiError";
        this.status = status;
        this.payload = payload;
    }
}

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setToken(token: string) {
    try {
        window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // Private browsing with storage disabled — the session simply won't
        // survive a reload, which is preferable to crashing the sign-in.
    }
}

export function clearToken() {
    try {
        window.localStorage.removeItem(TOKEN_KEY);
    } catch {
        // Nothing to do.
    }
}

/** Calls `/api/...` on this same origin and returns the parsed body. */
export async function api<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
        response = await fetch(`/api${endpoint}`, { ...options, headers });
    } catch {
        throw new ConsoleApiError(
            "Cannot reach the server. Is the backend still running?",
            0
        );
    }

    let data: Record<string, unknown> = {};
    const text = await response.text();
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text.slice(0, 200) };
        }
    }

    if (!response.ok) {
        throw new ConsoleApiError(
            (data.error as string) || `Request failed (HTTP ${response.status})`,
            response.status,
            data
        );
    }

    return data as T;
}

export const post = <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: "POST", body: JSON.stringify(body) });

export const put = <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, {
        method: "PUT",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

export const del = <T>(endpoint: string) => api<T>(endpoint, { method: "DELETE" });

/** Pulls a readable message off anything thrown by the helpers above. */
export function messageOf(error: unknown, fallback = "Something went wrong."): string {
    return error instanceof Error ? error.message : fallback;
}
