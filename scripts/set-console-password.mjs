/**
 * Creates or updates the admin account the console signs in as.
 *
 *   npm run set-console-password
 *   npm run set-console-password -- someone@mgm.edu "a different password"
 *
 * Defaults match the pinned account in app/console/login/page.tsx. If the
 * account already exists its password is replaced; if it does not, an approved,
 * email-verified admin is created — which makes this the bootstrap step for a
 * fresh database, since /api/users needs an admin before it can mint one.
 */

import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const email = (process.argv[2] ?? "admin@mgm.edu").toLowerCase().trim();
const password = process.argv[3] ?? "rushi@mgm";
const name = process.argv[4] ?? "MGM Administrator";

const DB_URL = process.env.DB_URL;

if (!DB_URL) {
    console.error(
        "\n✗ DB_URL is not set.\n" +
            "  Set it in mgm-backend/.env, then run this again.\n"
    );
    process.exit(1);
}

if (password.length < 6) {
    console.error("\n✗ Password must be at least 6 characters.\n");
    process.exit(1);
}

// Minimal schema: this script only touches these fields, and defining it here
// avoids pulling the TypeScript model into a plain-node context.
const User = mongoose.model(
    "User",
    new mongoose.Schema(
        {
            name: String,
            email: { type: String, unique: true, lowercase: true, trim: true },
            password: String,
            role: String,
            isEmailVerified: Boolean,
            approvalStatus: String,
        },
        { timestamps: true, strict: false }
    )
);

try {
    await mongoose.connect(DB_URL, { dbName: "mgm" });

    const hashed = await bcrypt.hash(password, 10);
    const existing = await User.findOne({ email });

    if (existing) {
        existing.password = hashed;
        // An account that can't sign in is no use to the console, so make sure
        // the flags allow it even if the account was previously restricted.
        existing.role = existing.role === "admin" ? "admin" : existing.role;
        existing.isEmailVerified = true;
        existing.approvalStatus = "approved";
        await existing.save();

        console.log(`\n✓ Password updated for ${email} (role: ${existing.role}).`);
        if (existing.role === "staff") {
            console.log(
                "  ⚠ This is a staff account — the console will refuse it.\n" +
                    "    Promote it in the database, or pass an admin's email instead."
            );
        }
    } else {
        await User.create({
            name,
            email,
            password: hashed,
            role: "admin",
            isEmailVerified: true,
            approvalStatus: "approved",
        });
        console.log(`\n✓ Created admin account ${email}.`);
    }

    console.log(`  Sign in at /console with the password you just set.\n`);
} catch (error) {
    console.error("\n✗ Failed:", error instanceof Error ? error.message : error, "\n");
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
