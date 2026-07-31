import { after } from "next/server";
import { transporter } from "@/lib/transpoter";

export interface MailOptions {
    to: string;
    subject: string;
    html: string;
}

/** A rendered template, still missing its recipient. */
export type MailBody = Omit<MailOptions, "to">;

function fromAddress(): string {
    return process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@mgm.edu";
}

/**
 * Sends an email and waits for the result.
 *
 * Only use this when the user is blocked on the mail actually going out (the
 * signup OTP being the one real case) — SMTP round-trips are slow enough to
 * dominate the response time.
 */
export async function sendMailNow(options: MailOptions): Promise<void> {
    await transporter.sendMail({ from: fromAddress(), ...options });
}

/**
 * Hands an email off to be sent after the response has been flushed.
 *
 * Notification mail must never sit in the request path — a manager tapping
 * "Resolved" shouldn't wait on Gmail. `after` keeps the work inside the
 * server's lifecycle so it still runs on serverless platforms, unlike a bare
 * floating promise. Failures are logged, never surfaced: the in-app
 * notification is the source of truth.
 */
export function queueMail(options: MailOptions): void {
    after(async () => {
        try {
            await sendMailNow(options);
        } catch (error) {
            console.error(`[mail] failed to send "${options.subject}" to ${options.to}:`, error);
        }
    });
}

const shell = (body: string) => `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    ${body}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="font-size:12px;color:#64748b">
        MGM College — Maintenance &amp; Complaint Management System.
        This is an automated message; please do not reply.
    </p>
</div>`;

export function otpEmail(name: string, otp: string): MailBody {
    return {
        subject: "MGM Maintenance - Email Verification Code",
        html: shell(`
            <h2>Welcome to MGM Maintenance Management</h2>
            <p>Dear ${name},</p>
            <p>Your verification code for the MGM Maintenance Portal is:</p>
            <p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#2563eb;margin:16px 0">${otp}</p>
            <p>This code is valid for 15 minutes.</p>
            <p style="color:#64748b">
                Once your email is verified, a manager still needs to approve your
                account before you can raise complaints.
            </p>
        `),
    };
}

export function statusUpdateEmail(
    name: string,
    heading: string,
    message: string,
    complaintTitle: string,
    status: string
): MailBody {
    return {
        subject: `MGM Maintenance: ${heading}`,
        html: shell(`
            <h2>${heading}</h2>
            <p>Dear ${name},</p>
            <p>${message}</p>
            <p style="margin-top:20px"><strong>Complaint details</strong></p>
            <ul>
                <li><strong>Title:</strong> ${complaintTitle}</li>
                <li><strong>Status:</strong> ${status.replace("_", " ").toUpperCase()}</li>
            </ul>
            <p>Thank you for helping keep our campus infrastructure maintained.</p>
        `),
    };
}

export function approvalEmail(name: string, approved: boolean): MailBody {
    return approved
        ? {
              subject: "MGM Maintenance - Account Approved",
              html: shell(`
                <h2>Account approved</h2>
                <p>Dear ${name},</p>
                <p>Your registration for the MGM Maintenance Portal has been approved.</p>
                <p>You can now log in and start submitting damage complaints.</p>
            `),
          }
        : {
              subject: "MGM Maintenance - Registration Update",
              html: shell(`
                <h2>Registration not approved</h2>
                <p>Dear ${name},</p>
                <p>Your registration request for the MGM Maintenance Portal was not approved.</p>
                <p>If you believe this is a mistake, please contact the Estate Manager's office.</p>
            `),
          };
}
