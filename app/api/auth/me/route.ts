import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import User from "@/models/User";
import { errorResponse, requireUser } from "@/lib/api-helpers";

/**
 * Returns the current user, re-validated against the database.
 *
 * Tokens live for 7 days, so the role and approval state baked into a token can
 * be stale. The app calls this on every launch, which makes it both the
 * enforcement point for access that has since been revoked (a staff member who
 * is rejected gets a 403 here and is signed out by the client) and the way a
 * pending staff member learns their registration has been approved.
 */
export async function GET(req: NextRequest) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        const user = await User.findById(auth.user.userId).select(
            "-password +passwordChangedAt"
        );
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // A password reset retires every token minted before it. Tokens are
        // stateless and last 7 days, so without this check whoever prompted the
        // reset would keep their session for the rest of the week.
        if (user.passwordChangedAt && auth.user.iat) {
            // iat is whole seconds; allow a second of slack so the token issued
            // by the very next login isn't caught by its own reset timestamp.
            if (auth.user.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
                return NextResponse.json(
                    {
                        error: "Your password was changed. Please sign in again.",
                        passwordChanged: true,
                    },
                    { status: 401 }
                );
            }
        }

        if (!user.isEmailVerified) {
            return NextResponse.json(
                { error: "Email not verified.", isEmailVerified: false },
                { status: 403 }
            );
        }

        // Pending staff keep their session — this endpoint is how the app finds
        // out they've since been approved, so 403ing them would sign them out on
        // every launch and they'd never see the change. The pending state rides
        // along on the user object below and the client restricts the UI.
        //
        // Rejection still ends the session: this is the revocation path for
        // someone who was approved and later wasn't.
        if (user.role === "staff" && user.approvalStatus === "rejected") {
            return NextResponse.json(
                {
                    error: "Your account access has been revoked.",
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
