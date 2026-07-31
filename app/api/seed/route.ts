import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connect from "@/lib/db";
import User from "@/models/User";
import Building from "@/models/Building";
import Floor from "@/models/Floor";
import Room from "@/models/Room";
import { errorResponse } from "@/lib/api-helpers";

/**
 * Development-only database seeding.
 *
 * This endpoint upserts the three demo accounts, which means it RESETS their
 * passwords to well-known values. Left open it was a full admin takeover: anyone
 * could POST to it on a deployed instance and log in as admin@mgm.edu/admin123.
 *
 * It is therefore disabled outright in production, and additionally requires
 * SEED_SECRET to match when that variable is configured.
 */
export async function POST(req: NextRequest) {
    try {
        if (process.env.NODE_ENV === "production") {
            return NextResponse.json(
                { error: "Seeding is disabled in production." },
                { status: 403 }
            );
        }

        const seedSecret = process.env.SEED_SECRET;
        if (seedSecret && req.headers.get("x-seed-secret") !== seedSecret) {
            return NextResponse.json(
                { error: "Invalid or missing seed secret." },
                { status: 403 }
            );
        }

        await connect();

        // 1. Seed Users
        const demoUsers = [
            {
                email: "admin@mgm.edu",
                password: "admin123",
                name: "System Admin",
                role: "admin" as const,
                department: "Administration",
            },
            {
                email: "manager@mgm.edu",
                password: "manager123",
                name: "Estate Manager",
                role: "manager" as const,
                department: "Maintenance & Infrastructure",
            },
            {
                email: "staff@mgm.edu",
                password: "staff123",
                name: "John Staff",
                role: "staff" as const,
                department: "Computer Science",
            },
        ];

        const seededEmails: string[] = [];
        for (const demo of demoUsers) {
            const user = await User.findOneAndUpdate(
                { email: demo.email },
                {
                    name: demo.name,
                    email: demo.email,
                    password: await bcrypt.hash(demo.password, 10),
                    role: demo.role,
                    department: demo.department,
                    isEmailVerified: true,
                    approvalStatus: "approved",
                },
                { upsert: true, new: true }
            );
            seededEmails.push(user.email);
        }

        // 2. Seed Sample Building: Engineering Block A
        const building = await Building.findOneAndUpdate(
            { code: "ENG-A" },
            {
                name: "Engineering Block A",
                code: "ENG-A",
                description: "Main Academic Building for Engineering & Technology",
                address: "MGM Campus, Main Gate",
            },
            { upsert: true, new: true }
        );

        // 3. Seed Floors & Rooms (Ground = G, First = F, Second = S)
        const floorsData = [
            { name: "Ground Floor", floorNumber: 0, prefix: "G" },
            { name: "First Floor", floorNumber: 1, prefix: "F" },
            { name: "Second Floor", floorNumber: 2, prefix: "S" },
        ];

        const createdFloors = [];
        const createdRooms = [];

        for (const fData of floorsData) {
            const floor = await Floor.findOneAndUpdate(
                { buildingId: building._id, floorNumber: fData.floorNumber },
                {
                    buildingId: building._id,
                    name: fData.name,
                    floorNumber: fData.floorNumber,
                    prefix: fData.prefix,
                },
                { upsert: true, new: true }
            );
            createdFloors.push(floor);

            // Create 3 classrooms and 1 washroom per floor
            for (let i = 1; i <= 3; i++) {
                const roomNum = `${fData.prefix}-${i}`;
                const room = await Room.findOneAndUpdate(
                    { floorId: floor._id, roomNumber: roomNum },
                    {
                        floorId: floor._id,
                        roomNumber: roomNum,
                        roomType: "classroom",
                        name: `Classroom ${roomNum}`,
                    },
                    { upsert: true, new: true }
                );
                createdRooms.push(room);
            }

            const washroomNum = `${fData.prefix}-WR`;
            const washroom = await Room.findOneAndUpdate(
                { floorId: floor._id, roomNumber: washroomNum },
                {
                    floorId: floor._id,
                    roomNumber: washroomNum,
                    roomType: "washroom",
                    name: `${fData.name} Main Washroom`,
                },
                { upsert: true, new: true }
            );
            createdRooms.push(washroom);
        }

        return NextResponse.json({
            message: "Database seeded successfully!",
            seedData: {
                users: seededEmails,
                building: building.name,
                floorsCount: createdFloors.length,
                roomsCount: createdRooms.length,
            },
        });
    } catch (error: unknown) {
        return errorResponse(error, "seed");
    }
}
