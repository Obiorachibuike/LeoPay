import { Landmark } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { listBeneficiaries, maskedAccount } from "@/services/payouts";
import { defaultProvider } from "@/lib/providers";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { BeneficiaryForm } from "@/components/dashboard/payout-forms";

export default async function BeneficiariesPage() {
  const ctx = await requirePermission("payout:read");
  const rows = await listBeneficiaries(ctx.organization.id);
  const provider = defaultProvider();
  const banksAvailable = provider.isConfigured() && provider.capabilities.accountResolution;

  let banks: Array<{ code: string; name: string }> = [];
  if (banksAvailable) {
    try {
      banks = await provider.listBanks();
    } catch {
      banks = [];
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Beneficiaries"
        description="Bank accounts you can pay out to. Account names are resolved with your provider — never assumed."
      />

      {!banksAvailable ? (
        <Alert tone="warning" title="Provider not configured">
          Beneficiary verification requires a configured provider. You can review existing beneficiaries, but new ones
          cannot be verified right now.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Saved beneficiaries" description={`${rows.length} active`} />
          {rows.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<Landmark className="h-5 w-5" />}
                title="No beneficiaries yet"
                description="Add a bank account. The account name is resolved by your provider so a payout cannot silently go to the wrong person."
              />
            </CardBody>
          ) : (
            <TableWrap>
              <thead>
                <tr><Th>Name</Th><Th>Bank</Th><Th>Account</Th><Th>Verification</Th><Th>Added</Th></tr>
              </thead>
              <tbody>
                {rows.map((beneficiary) => (
                  <Tr key={beneficiary.id}>
                    <Td>
                      <span className="font-medium">{beneficiary.name}</span>
                      <span className="block text-[10.5px] text-muted">{beneficiary.accountName}</span>
                    </Td>
                    <Td className="text-muted">{beneficiary.bankName}</Td>
                    <Td className="font-mono text-[11.5px]">{maskedAccount(beneficiary)}</Td>
                    <Td><StatusBadge status={beneficiary.verificationStatus} /></Td>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(beneficiary.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Add a beneficiary" description="Account numbers are encrypted at rest; only the last four digits are shown." />
          <CardBody>
            <BeneficiaryForm banks={banks} banksAvailable={banksAvailable} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
