import nodemailer from "nodemailer";

type Transporter = ReturnType<typeof nodemailer.createTransport>;

// Lazy load transporter to ensure env vars are loaded
let transporterInstance: Transporter | null = null;

// Create transporter with multiple fallback configurations
const createEmailTransporter = () => {
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
    const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;

    // Log for debugging
    console.log('📧 Creating email transporter...');
    console.log('   SMTP_HOST:', SMTP_HOST);
    console.log('   SMTP_PORT:', SMTP_PORT);
    console.log('   SMTP_USER:', SMTP_USER || '❌ NOT SET');
    console.log('   SMTP_PASS:', SMTP_PASS ? '✅ SET' : '❌ NOT SET');

    // Validate credentials
    if (!SMTP_USER || !SMTP_PASS) {
        const error = new Error(
            '❌ SMTP credentials not configured!\n' +
            'Please set SMTP_USER and SMTP_PASS environment variables.\n' +
            `Current values: SMTP_USER=${SMTP_USER || 'undefined'}, SMTP_PASS=${SMTP_PASS ? 'set' : 'undefined'}`
        );
        console.error(error.message);
        throw error;
    }

    // Certificate validation is only relaxed outside production, and only when
    // explicitly opted into via SMTP_ALLOW_INSECURE_TLS — for a self-signed
    // relay on a dev box. Disabling it unconditionally would leave mail (and the
    // SMTP password) open to interception in production.
    const allowInsecureTLS =
        process.env.NODE_ENV !== 'production' &&
        process.env.SMTP_ALLOW_INSECURE_TLS === 'true';

    if (allowInsecureTLS) {
        console.warn('⚠️  SMTP certificate validation is DISABLED (development only)');
    }

    const primaryConfig = {
        host: SMTP_HOST,
        port: SMTP_PORT,
        // Port 465 is implicit TLS; 587 and others upgrade via STARTTLS.
        secure: SMTP_PORT === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: !allowInsecureTLS,
            // No `ciphers` override: pinning 'SSLv3' forced an obsolete cipher
            // suite that modern servers (Gmail included) refuse outright.
        },
        // Kept short enough that a wedged SMTP server surfaces as a quick
        // failure rather than a minute-long hang.
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
    };

    console.log('✅ Email transporter configured successfully');

    return nodemailer.createTransport(primaryConfig);
};

// Export a getter function to lazy load the transporter
export const getTransporter = () => {
    if (!transporterInstance) {
        transporterInstance = createEmailTransporter();
    }
    return transporterInstance;
};

// For backward compatibility - lazy load on first use
export const transporter = {
    sendMail: (...args: Parameters<Transporter["sendMail"]>) =>
        getTransporter().sendMail(...args),
    verify: (...args: Parameters<Transporter["verify"]>) =>
        getTransporter().verify(...args),
};
