import { redirect } from "next/navigation";

export default async function InvoiceAliasPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  redirect(`/i/${reference}`);
}
