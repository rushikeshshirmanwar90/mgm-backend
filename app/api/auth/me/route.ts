import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import User from "@/models/User";
import { errorResponse, requireUser } from "@/lib/api-helpers";

/**
 * Returns the current user, re-validated against the database.
 *
 * Tokens live for 7 days, so the role and approval state baked into a token can
 * be stale. The app calls this on every launch, which makes it the enforcement
 * point for access that has since been revoked: a staff member who is rejected
 * after logging in gets a 403 here and is signed out by the client.
 */
export async function GET(req: NextRequest) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        const user = await User.findById(auth.user.userId).select("-password");
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.isEmailVerified) {
            return NextResponse.json(
                { error: "Email not verified.", isEmailVerified: false },
                { status: 403 }
            );
        }

        if (user.role === "staff" && !user.isApproved) {
            return NextResponse.json(
                {
                    error:
                        user.approvalStatus === "rejected"
                            ? "Your account access has been revoked."
                            : "Your account is pending manager approval.",
                    isApproved: false,
                    approvalStatus: user.approvalStatus,
                },
                { status: 403 }
            );
        }

        return NextResponse.json({
            user: {
                id: user._id.toString(),
                _id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                department: user.department,
                phone: user.phone,
                isEmailVerified: user.isEmailVerified,
                isApproved: user.isApproved,
                approvalStatus: user.approvalStatus,
                // Surfaced as "Member since" on the profile screen.
                createdAt: user.createdAt,
            },
        });
    } catch (error: unknown) {
        return errorResponse(error, "auth/me");
    }
}
