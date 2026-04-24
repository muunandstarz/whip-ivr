/**
 * Clerk authentication helper for the tRPC context.
 * Uses the Clerk middleware's getAuth() to read the authenticated user from the request,
 * then upserts the user into the local `users` table for local DB tracking.
 */
import { createClerkClient, getAuth } from "@clerk/express";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { Request } from "express";

const clerkClient = createClerkClient({ secretKey: ENV.clerkSecretKey });

export async function authenticateClerkRequest(req: Request) {
  try {
    // getAuth reads the Clerk auth state set by clerkMiddleware()
    const auth = getAuth(req);
    const clerkUserId = auth.userId;

    if (!clerkUserId) return null;

    const db = await getDb();
    if (!db) return null;

    // Look up user in local DB by Clerk user ID
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.openId, clerkUserId))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // First sign-in: fetch full user info from Clerk and create local record
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? "";
    const fullName = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ");

    // Upsert into local users table
    await db
      .insert(users)
      .values({
        openId: clerkUserId,
        name: fullName || primaryEmail,
        email: primaryEmail,
        loginMethod: "clerk",
        role: "user",
      })
      .onDuplicateKeyUpdate({
        set: {
          name: fullName || primaryEmail,
          email: primaryEmail,
          loginMethod: "clerk",
          lastSignedIn: new Date(),
        },
      });

    const newUser = await db
      .select()
      .from(users)
      .where(eq(users.openId, clerkUserId))
      .limit(1);

    return newUser[0] ?? null;
  } catch (err: any) {
    // Not authenticated — treat as public request
    return null;
  }
}
