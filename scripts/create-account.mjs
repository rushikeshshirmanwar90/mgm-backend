/**
 * Creates (or resets) an approved, email-verified account of any role.
 *
 *   npm run create-account -- director@mgm.edu "a password" director "Campus Director"
 *
 * Useful for roles that can't self-register — directors and managers — on a
 * database where nobody has created one from the admin screens yet. If the
 * email already exists, its password and role are replaced.
 */

import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const ROLES = ["staff", "manager", "director", "admin"];

const [emailArg, password, role, ...nameParts] = process.argv.slice(2);
const email = (emailArg ?? "").toLowerCase().trim();
const name = nameParts.join(" ").trim() || email.split("@")[0];

const DB_URL = process.env.DB_URL;

if (!email || !password || !role) {
    console.error(
        '\nUsage: npm run create-account -- <email> <password> <role> ["Full name"]\n' +
            `  role is one of: ${ROLES.join(", ")}\n`
    );
    process.exit(1);
}
if (!ROLES.includes(role)) {
    console.error(`\n✗ Role must be one of: ${ROLES.join(", ")}\n`);
    process.exit(1);
}
if (password.length < 6) {
    console.error("\n✗ Password must be at least 6 characters.\n");
    process.exit(1);
}
if (!DB_URL) {
    console.error("\n✗ DB_URL is not set. Set it in mgm-backend/.env, then run this again.\n");
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
        existing.role = role;
        existing.isEmailVerified = true;
        existing.approvalStatus = "approved";
        await existing.save();
        console.log(`\n✓ Updated ${email}: role ${role}, password reset.`);
    } else {
        await User.create({
            name,
            email,
            password: hashed,
            role,
            isEmailVerified: true,
            approvalStatus: "approved",
        });
        console.log(`\n✓ Created ${role} account ${email}.`);
    }
    console.log("  It can sign in right away.\n");
} catch (error) {
    console.error("\n✗ Could not save the account:", error.message, "\n");
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
