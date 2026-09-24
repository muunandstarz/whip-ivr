import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../_core/trpc';
import {
  approveInternalTicketForProduction,
  getInternalTicket,
  getTicketDigestStatus,
  listInternalTickets,
  listMyInternalTickets,
  submitInternalTicket,
  triageInternalTicket,
  type TicketViewer,
} from '../tickets';

const ticketType = z.enum(['bug', 'issue', 'suggestion', 'other']);
const ticketStatus = z.enum(['new', 'triaged', 'in_progress', 'ready_for_approval', 'approved_for_production', 'resolved', 'closed']);
const ticketPriority = z.enum(['low', 'normal', 'high', 'urgent']);

function viewerFromContext(ctx: { user: { id: number; name: string | null; email: string | null; role: 'admin' | 'user'; handlerProfileId: number | null }; req: { headers: Record<string, string | string[] | undefined> } }): TicketViewer {
  const previewingHandler = typeof ctx.req.headers['x-impersonate-handler-id'] === 'string';
  return {
    userId: ctx.user.id,
    name: ctx.user.name ?? ctx.user.email ?? 'Whip user',
    email: ctx.user.email,
    // A handler preview must not silently submit a ticket under someone else.
    handlerId: previewingHandler ? null : ctx.user.handlerProfileId,
    isAdmin: ctx.user.role === 'admin' && !previewingHandler,
  };
}

function rethrow(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Ticket operation failed.';
  const code = /administrator|not available|not found|access/i.test(message) ? 'FORBIDDEN' : 'BAD_REQUEST';
  throw new TRPCError({ code, message });
}

export const ticketsRouter = router({
  submit: protectedProcedure
    .input(z.object({
      ticketType,
      title: z.string().trim().min(3).max(180),
      body: z.string().trim().min(10).max(5_000),
    }))
    .mutation(async ({ ctx, input }) => {
      try { return await submitInternalTicket({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  mine: protectedProcedure
    .input(z.object({ status: ticketStatus.optional(), ticketType: ticketType.optional(), limit: z.number().int().min(1).max(250).optional(), offset: z.number().int().min(0).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try { return await listMyInternalTickets(viewerFromContext(ctx), input); }
      catch (error) { return rethrow(error); }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try { return await getInternalTicket(viewerFromContext(ctx), input.id); }
      catch (error) { return rethrow(error); }
    }),

  list: adminProcedure
    .input(z.object({ status: ticketStatus.optional(), priority: ticketPriority.optional(), ticketType: ticketType.optional(), search: z.string().trim().max(180).optional(), limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try { return await listInternalTickets(viewerFromContext(ctx), input); }
      catch (error) { return rethrow(error); }
    }),

  triage: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: ticketStatus, priority: ticketPriority, triageNote: z.string().trim().max(5_000).optional() }))
    .mutation(async ({ ctx, input }) => {
      try { return await triageInternalTicket({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  approveForProduction: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try { return await approveInternalTicketForProduction({ viewer: viewerFromContext(ctx), id: input.id }); }
      catch (error) { return rethrow(error); }
    }),

  digestStatus: adminProcedure.query(async ({ ctx }) => {
    try { return await getTicketDigestStatus(viewerFromContext(ctx)); }
    catch (error) { return rethrow(error); }
  }),
});
