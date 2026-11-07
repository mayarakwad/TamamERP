import type { Metadata } from "next";
import { PaymentsPage } from "../../_biz/payments-page";

export const metadata: Metadata = { title: "Payments made" };

export default async function PaymentsOutPage({ params, searchParams }: PageProps<"/w/[slug]/purchases/payments">) {
  const { slug } = await params;
  return <PaymentsPage slug={slug} direction="out" sp={await searchParams} />;
}
