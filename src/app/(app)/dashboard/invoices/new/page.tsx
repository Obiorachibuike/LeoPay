import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { InvoiceEditor } from "@/components/dashboard/invoice-forms";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";

export default async function NewInvoicePage() {
  await requirePermission("invoice:write");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/dashboard/invoices" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Invoices
      </Link>
      <PageHeader title="Create an invoice" description="Totals are calculated on the server — the preview is for your convenience only." />
      <Card>
        <CardBody>
          <InvoiceEditor />
        </CardBody>
      </Card>
    </div>
  );
}
