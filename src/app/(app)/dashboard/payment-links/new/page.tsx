import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { CreateLinkForm } from "@/components/dashboard/link-forms";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";

export default async function NewPaymentLinkPage() {
  await requirePermission("payment:write");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/dashboard/payment-links" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Payment links
      </Link>
      <PageHeader title="Create a payment link" description="You can preview the checkout before sharing it." />
      <Card>
        <CardBody>
          <CreateLinkForm />
        </CardBody>
      </Card>
    </div>
  );
}
