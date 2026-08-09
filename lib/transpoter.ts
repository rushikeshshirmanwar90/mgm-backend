import nodemailer from "nodemailer";

type Transporter = ReturnType<typeof nodemailer.createTransport>;

interface Resolved {
    tx: Transporter;
    /** True when mail is being captured by a test inbox rather than delivered. */
    ethereal: boolean;
}

// Resolved once and reused. The promise itself is cached (not just the result)
// so concurrent first-requests share a single setup rather than each racing to
// build their own transport.
let resolved: Promise<Resolved> | null = null;

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Builds the transport described by the SMTP_* environment variables.
 * Throws when credentials are absent — callers decide whether that is fatal.
 */
const buildConfiguredTransport = (): Transporter => {
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
    const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;

    console.log("📧 Creating email transporter...");
    console.log("   SMTP_HOST:", SMTP_HOST);
    console.log("   SMTP_PORT:", SMTP_PORT);
    console.log("   SMTP_USER:", SMTP_USER || "❌ NOT SET");
    console.log("   SMTP_PASS:", SMTP_PASS ? "✅ SET" : "❌ NOT SET");

    if (!SMTP_USER || !SMTP_PASS) {
        throw new Error(
            "SMTP credentials not configured — set SMTP_USER and SMTP_PASS. " +
                `Current values: SMTP_USER=${SMTP_USER || "undefined"}, SMTP_PASS=${SMTP_PASS ? "set" : "undefined"}`
        );
    }

    // Certificate validation is only relaxed outside production, and only when
    // explicitly opted into via SMTP_ALLOW_INSECURE_TLS — for a self-signed
    // relay, or a local antivirus that re-signs SMTP connections. Disabling it
    // unconditionally would leave mail (and the SMTP password) open to
    // interception in production.
    const allowInsecureTLS =
        !isProduction() && process.env.SMTP_ALLOW_INSECURE_TLS === "true";

    if (allowInsecureTLS) {
        console.warn("⚠️  SMTP certificate validation is DISABLED (development only)");
    }

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        // Port 465 is implicit TLS; 587 and others upgrade via STARTTLS.
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        tls: {
            rejectUnauthorized: !allowInsecureTLS,
            // No `ciphers` override: pinning 'SSLv3' forces an obsolete cipher
            // suite that modern servers (Gmail included) refuse outright.
        },
        // Kept short enough that a wedged SMTP server surfaces as a quick
        // failure rather than a minute-long hang.
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
    });
};

/**
 * A throwaway inbox from ethereal.email, created on demand.
 *
 * Nothing is delivered to the real recipient — each message gets a preview URL
 * printed to the server log instead. This exists so the app's mail-dependent
 * flows (signup OTP, password reset) remain testable on a machine with no
 * working SMTP credentials, which is otherwise a hard stop on development.
 */
const buildEtherealTransport = async (): Promise<Transporter> => {
    const account = await nodemailer.createTestAccount();

    console.warn("");
    console.warn("╔══════════════════════════════════════════════════════════════╗");
    console.warn("║  ✉️   DEVELOPMENT MAIL FALLBACK ACTIVE                        ║");
    console.warn("║  Real SMTP is unavailable, so mail is being captured by a    ║");
    console.warn("║  test inbox at ethereal.email and NOT delivered to anyone.   ║");
    console.warn("║  A preview link is logged for every message sent.            ║");
    console.warn("╚══════════════════════════════════════════════════════════════╝");
    console.warn("");

    return nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
        tls: {
            // Same local-interception caveat as above; dev-only by construction
            // since this transport is never built in production.
            rejectUnauthorized: process.env.SMTP_ALLOW_INSECURE_TLS !== "true",
        },
    });
};

const resolveTransporter = async (): Promise<Resolved> => {
    // Production takes the configured transport or nothing. Falling back to a
    // test inbox here would look like success while silently dropping every
    // password reset on the floor.
    if (isProduction()) {
        return { tx: buildConfiguredTransport(), ethereal: false };
    }

    try {
        const tx = buildConfiguredTransport();
        // Proving the login now turns a per-send failure into one clear message
        // at startup, and is what lets the fallback below trigger.
        await tx.verify();
        console.log("✅ Email transporter configured successfully");
        return { tx, ethereal: false };
    } catch (error) {
        const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
        console.error("❌ Configured SMTP unusable:", reason);

        if (process.env.SMTP_DEV_FALLBACK === "false") {
            throw error;
        }

        try {
            return { tx: await buildEtherealTransport(), ethereal: true };
        } catch {
            // Ethereal needs network access of its own. If that is also gone,
            // the original SMTP failure is the more useful thing to report.
            throw error;
        }
    }
};

const getResolved = (): Promise<Resolved> => {
    if (!resolved) {
        resolved = resolveTransporter().catch((error) => {
            // Don't cache a failure — a fixed password should take effect on the
            // next request rather than requiring a server restart.
            resolved = null;
            throw error;
        });
    }
    return resolved;
};

export const getTransporter = async (): Promise<Transporter> => (await getResolved()).tx;

export const transporter = {
    sendMail: async (...args: Parameters<Transporter["sendMail"]>) => {
        const { tx, ethereal } = await getResolved();
        const info = await tx.sendMail(...args);

        if (ethereal) {
            const preview = nodemailer.getTestMessageUrl(info);
            if (preview) console.log("✉️  Mail preview (not delivered):", preview);
        }

        return info;
    },
    verify: async (...args: Parameters<Transporter["verify"]>) => {
        const { tx } = await getResolved();
        return tx.verify(...args);
    },
};
