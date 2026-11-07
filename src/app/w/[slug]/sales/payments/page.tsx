import type { Metadata } from "next";
import { PaymentsPage } from "../../_biz/payments-page";

export const metadata: Metadata = { title: "Payments received" };

export default async function PaymentsInPage({ params, searchParams }: PageProps<"/w/[slug]/sales/payments">) {
  const { slug } = await params;
  return <PaymentsPage slug={slug} direction="in" sp={await searchParams} />;
}
