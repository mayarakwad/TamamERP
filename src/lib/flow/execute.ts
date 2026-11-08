import "server-only";
import { createClaim, approveClaim, rejectClaim, type ClaimInput } from "@/app/actions/claims";
import { saveBill, setBudget, savePossession, type BillInput, type PossessionInput } from "@/app/actions/home";
import { saveDoc, savePayment, type DocInput, type PaymentFormInput } from "@/app/actions/biz";
import { requestLeave, decideLeave, type LeaveInput } from "@/app/actions/hr";
import { publishAnnouncement, type AnnouncementInput } from "@/app/actions/campus";
import { recordFeePayment, sendFeeReminders } from "@/app/actions/fees";
import { addComment } from "@/app/actions/comments";
import type { DocKind } from "../docs/ops";

// Runs a confirmed proposal through the same server action the app's own
// screens use, so validation, permissions, postings, notifications and the
// activity log are exactly the same as doing it by hand.

export type ExecResult = { ok: true; message: string; messageAr: string; href?: string; celebrate?: boolean } | { ok: false; error: string };

type R = { ok: boolean; error?: string } & Record<string, unknown>;
const fail = (r: R): ExecResult => ({ ok: false, error: r.error ?? "errors.generic" });

const DOC_PATH: Record<string, string> = { quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills" };

export async function executeProposal(slug: string, kind: string, data: Record<string, unknown>): Promise<ExecResult> {
  switch (kind) {
    case "claim": {
      const r = (await createClaim(slug, data as unknown as ClaimInput)) as R;
      if (!r.ok) return fail(r);
      return { ok: true, message: `Claim ${r.number} submitted`, messageAr: `تم تقديم المطالبة ${r.number}`, href: `claims/${r.id}` };
    }
    case "claimDecision": {
      const id = String(data.id);
      const r = (data.decision === "approve" ? await approveClaim(slug, id, String(data.note ?? "")) : await rejectClaim(slug, id, String(data.note ?? ""))) as R;
      if (!r.ok) return fail(r);
      return data.decision === "approve"
        ? { ok: true, message: `${r.number} approved`, messageAr: `تم اعتماد ${r.number}`, href: `claims/${id}`, celebrate: true }
        : { ok: true, message: `${r.number} declined`, messageAr: `تم رفض ${r.number}`, href: `claims/${id}` };
    }
    case "bill": {
      const r = (await saveBill(slug, null, data as unknown as BillInput)) as R;
      return r.ok ? { ok: true, message: "Bill added", messageAr: "تمت إضافة الفاتورة", href: "bills" } : fail(r);
    }
    case "budget": {
      const r = (await setBudget(slug, String(data.categoryId), String(data.month), String(data.amount))) as R;
      return r.ok ? { ok: true, message: "Budget set", messageAr: "تم تعيين الميزانية", href: `budgets?month=${data.month}` } : fail(r);
    }
    case "possession": {
      const r = (await savePossession(slug, null, data as unknown as PossessionInput)) as R;
      return r.ok ? { ok: true, message: "Added to things we own", messageAr: "تمت الإضافة إلى مقتنياتنا", href: `things?item=${r.id}` } : fail(r);
    }
    case "document": {
      const docKind = data.kind as DocKind;
      const r = (await saveDoc(slug, docKind, null, data.input as DocInput)) as R;
      return r.ok ? { ok: true, message: `Draft ${r.number} saved`, messageAr: `تم حفظ المسودة ${r.number}`, href: `${DOC_PATH[docKind]}/${r.id}` } : fail(r);
    }
    case "payment": {
      const r = (await savePayment(slug, data as unknown as PaymentFormInput)) as R;
      return r.ok ? { ok: true, message: `Payment ${r.number} recorded`, messageAr: `تم تسجيل الدفعة ${r.number}`, href: data.direction === "in" ? "sales/payments" : "purchases/payments", celebrate: data.direction === "in" } : fail(r);
    }
    case "leaveRequest": {
      const r = (await requestLeave(slug, data as unknown as LeaveInput)) as R;
      return r.ok ? { ok: true, message: `Leave request ${r.number} sent`, messageAr: `تم إرسال طلب الإجازة ${r.number}`, href: "hr/leave" } : fail(r);
    }
    case "leaveDecision": {
      const r = (await decideLeave(slug, String(data.id), data.decision as "approve" | "reject", String(data.note ?? ""))) as R;
      return r.ok ? { ok: true, message: data.decision === "approve" ? "Leave approved" : "Leave declined", messageAr: data.decision === "approve" ? "تم اعتماد الإجازة" : "تم رفض الإجازة", href: "hr/leave" } : fail(r);
    }
    case "announcement": {
      const r = (await publishAnnouncement(slug, data as unknown as AnnouncementInput)) as R;
      return r.ok ? { ok: true, message: `Announcement published to ${r.count} people`, messageAr: `تم نشر الإعلان إلى ${r.count} شخصاً`, href: "announcements" } : fail(r);
    }
    case "feePayment": {
      const r = (await recordFeePayment(slug, data as Parameters<typeof recordFeePayment>[1])) as R;
      if (!r.ok) return fail(r);
      const paid = (r.fullyPaid as string[] | undefined) ?? [];
      return { ok: true, message: paid.length ? `Payment ${r.number} recorded. ${paid.join(", ")}: fees paid in full` : `Payment ${r.number} recorded`, messageAr: paid.length ? `تم تسجيل الدفعة ${r.number}. ${paid.join("، ")}: سُددت الرسوم بالكامل` : `تم تسجيل الدفعة ${r.number}`, href: "fees/payments", celebrate: true };
    }
    case "feeReminders": {
      const r = (await sendFeeReminders(slug)) as R;
      return r.ok ? { ok: true, message: `Reminders sent to ${r.count} families`, messageAr: `أُرسلت التذكيرات إلى ${r.count} عائلة`, href: "fees/invoices?status=overdue" } : fail(r);
    }
    case "comment": {
      const r = (await addComment(slug, String(data.entityType), String(data.entityId), String(data.body))) as R;
      return r.ok ? { ok: true, message: "Comment posted", messageAr: "تم نشر التعليق", href: String(data.href ?? "") } : fail(r);
    }
    default:
      return { ok: false, error: "errors.generic" };
  }
}
