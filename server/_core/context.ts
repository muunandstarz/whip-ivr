import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Impersonation: admins may send x-impersonate-handler-id to scope
  // handler-specific procedures (myMailroom, myPendingCount) to a specific handler.
  if (user && user.role === 'admin') {
    const impersonateId = opts.req.headers['x-impersonate-handler-id'];
    if (impersonateId && typeof impersonateId === 'string') {
      const parsed = parseInt(impersonateId, 10);
      if (!isNaN(parsed)) {
        user = { ...user, handlerProfileId: parsed };
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
