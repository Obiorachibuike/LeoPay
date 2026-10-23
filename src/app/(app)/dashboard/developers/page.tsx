import { desc, eq } from "drizzle-orm";
import { KeyRound, Webhook } from "lucide-react";
import { db } from "@/lib/db/client";
import { apiKeys, webhookDeliveries, webhookEndpoints } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/context";
import { pendingWebhookStats } from "@/services/jobs";
import { MERCHANT_EVENT_TYPES } from "@/lib/events";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { ApiKeyForm, WebhookForm } from "@/components/dashboard/developer-forms";
import { ActionButton } from "@/components/ui/action-button";
import { revokeApiKeyAction, deleteWebhookAction, redeliverWebhookAction } from "@/app/actions/developers";

export default async function DevelopersPage() {
  const ctx = await requirePermission("developer:manage");
  const canManage = true;

  const [keys, endpoints, deliveries, stats] = await Promise.all([
    db.select().from(apiKeys).where(eq(apiKeys.organizationId, ctx.organization.id)).orderBy(desc(apiKeys.createdAt)),
    db.select().from(webhookEndpoints).where(eq(webhookEndpoints.organizationId, ctx.organization.id)).orderBy(desc(webhookEndpoints.createdAt)),
    db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.organizationId, ctx.organization.id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(15),
    pendingWebhookStats(ctx.organization.id),
  ]);

  const activeKeys = keys.filter((key) => !key.revokedAt);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Developers"
        description="API keys and webhook endpoints. Keys are shown once; only a hash is stored server-side."
      />

      <Card>
        <CardHeader title="API access" description={`Base URL: ${env.appUrl}/api/v1`} />
        <CardBody className="space-y-3">
          <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-[12px] text-muted">
            <p className="font-medium text-foreground">Authentication</p>
            <p className="mt-1">Send <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px]">Authorization: Bearer lp_test_…</code> with every request. Test keys can only read test data; live keys require a verified business.</p>
          </div>
          {keys.length === 0 ? (
            <p className="text-[12.5px] text-muted">No API keys yet.</p>
          ) : (
            <TableWrap>
              <thead><tr><Th>Key</Th><Th>Environment</Th><Th>Scopes</Th><Th>Last used</Th><Th align="right" /></tr></thead>
              <tbody>
                {keys.map((key) => (
                  <Tr key={key.id}>
                    <Td>
                      <span className="block font-medium">{key.name}</span>
                      <span className="block font-mono text-[10.5px] text-muted">{key.prefix}••••••••</span>
                    </Td>
                    <Td><Badge tone={key.environment === "live" ? "accent" : "neutral"}>{key.environment}</Badge></Td>
                    <Td className="text-[11px] text-muted">{key.scopes.join(", ") || "—"}</Td>
                    <Td className="text-muted">{key.lastUsedAt ? timeAgo(key.lastUsedAt) : "Never"}</Td>
                    <Td align="right">
                      {key.revokedAt ? (
                        <Badge tone="danger">revoked</Badge>
                      ) : canManage ? (
                        <ActionButton
                          action={revokeApiKeyAction.bind(null, key.id)}
                          variant="ghost"
                          size="sm"
                          confirm="Revoke this key? Integrations using it will stop working immediately."
                        >
                          Revoke
                        </ActionButton>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          {canManage ? (
            <div className="border-t border-border pt-3">
              <p className="mb-3 flex items-center gap-1.5 text-[12.5px] font-medium"><KeyRound className="h-3.5 w-3.5" /> Create a key</p>
              <ApiKeyForm />
            </div>
          ) : null}
          <p className="text-[11px] text-muted">{activeKeys.length} active key(s).</p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Webhook endpoints" description={`${stats.pending ?? 0} pending · ${stats.failed ?? 0} failed deliveries`} />
          <CardBody className="space-y-3">
            {endpoints.length === 0 ? (
              <p className="text-[12.5px] text-muted">No endpoints configured. Webhooks are delivered from a durable outbox with retries.</p>
            ) : (
              endpoints.map((endpoint) => (
                <div key={endpoint.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11.5px]">{endpoint.url}</p>
                      <p className="text-[11px] text-muted">
                        {endpoint.eventTypes.length} event type(s) · last delivery {endpoint.lastDeliveryAt ? timeAgo(endpoint.lastDeliveryAt) : "never"}
                        {endpoint.failureCount > 0 ? ` · ${endpoint.failureCount} consecutive failure(s)` : ""}
                      </p>
                    </div>
                    <Badge tone={endpoint.status === "active" ? "success" : "neutral"}>{endpoint.status}</Badge>
                  </div>
                  {canManage ? (
                    <div className="mt-2">
                      <ActionButton
                        action={deleteWebhookAction.bind(null, endpoint.id)}
                        variant="ghost"
                        size="sm"
                        confirm="Delete this endpoint? Pending deliveries for it are discarded."
                      >
                        Delete endpoint
                      </ActionButton>
                    </div>
                  ) : null}
                </div>
              ))
            )}
            <div className="border-t border-border pt-3">
              <p className="mb-3 flex items-center gap-1.5 text-[12.5px] font-medium"><Webhook className="h-3.5 w-3.5" /> Add an endpoint</p>
              {canManage ? <WebhookForm /> : <p className="text-[12px] text-muted">Your role cannot manage webhooks.</p>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent deliveries" description="Signed with HMAC-SHA256 over the raw body." />
          <CardBody className="space-y-2">
            {deliveries.length === 0 ? (
              <p className="text-[12.5px] text-muted">No deliveries yet.</p>
            ) : (
              deliveries.map((delivery) => (
                <div key={delivery.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 text-[12px] last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{delivery.eventType}</p>
                    <p className="text-[10.5px] text-muted">
                      {formatDateTime(delivery.createdAt)} · attempt {delivery.attempts}
                      {delivery.responseStatus ? ` · HTTP ${delivery.responseStatus}` : ""}
                    </p>
                    {delivery.error ? <p className="truncate text-[10.5px] text-red-600 dark:text-red-400">{delivery.error}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={delivery.status} />
                    {(delivery.status === "failed" || delivery.status === "dead") && canManage ? (
                      <ActionButton action={redeliverWebhookAction.bind(null, delivery.id)} variant="ghost" size="sm">
                        Retry
                      </ActionButton>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Verifying webhooks" />
        <CardBody className="space-y-2 text-[12px] text-muted">
          <p>Compute <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">HMAC-SHA256(secret, `${"`"}timestamp.rawBody${"`"}")</code> and compare it with the <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">X-LeoPay-Signature</code> header. Reject requests older than five minutes.</p>
          <p>Respond with 2xx quickly and process asynchronously. Delivery is retried with exponential backoff; endpoints failing repeatedly are marked unhealthy.</p>
        </CardBody>
      </Card>

      <Alert tone="info" title="Event types">
        {MERCHANT_EVENT_TYPES.join(" · ")}
      </Alert>
    </div>
  );
}
