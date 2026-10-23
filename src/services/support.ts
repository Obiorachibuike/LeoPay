import { db } from "@/lib/db/client";
import { supportTickets } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { queueEmail } from "@/services/notifications";
import type { z } from "zod";
import type { supportTicketSchema } from "@/lib/validation";

export async function submitSupportTicket(input: {
  data: z.infer<typeof supportTicketSchema>;
  ip?: string | null;
  organizationId?: string | null;
}) {
  await enforceRateLimit({ bucket: `support:${input.ip ?? "unknown"}`, limit: 5, windowSeconds: 3600 });

  const [ticket] = await db
    .insert(supportTickets)
    .values({
      organizationId: input.organizationId ?? null,
      name: input.data.name,
      email: input.data.email,
      subject: input.data.subject,
      message: input.data.message,
      reference: input.data.reference ?? null,
    })
    .returning();

  await queueEmail({
    to: input.data.email,
    template: "support_acknowledgement",
    data: { name: input.data.name, subject: input.data.subject },
  }).catch(() => undefined);

  await audit({
    action: "support.ticket_created",
    organizationId: input.organizationId ?? null,
    actorEmail: input.data.email,
    targetType: "support_ticket",
    targetId: ticket!.id,
  });

  return ticket!;
}
