"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, CircleDollarSign, Loader2, Pencil, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Gallery, type GalleryFile } from "@/components/records/gallery";
import { Thread } from "@/components/records/thread";
import { celebrate } from "@/components/motion/celebrate";
import { pick, type MessageKey } from "@/lib/i18n";
import type { ThreadItem } from "@/lib/thread";
import { approveClaim, deleteClaim, reimburseClaim, rejectClaim, reopenClaim } from "@/app/actions/claims";
import { ClaimSheet, type CategoryOption } from "../claim-sheet";

interface ClaimData {
  id: string;
  number: string;
  amount: number;
  merchant: string;
  spentOn: string;
  paidWith: "cash" | "card" | "transfer";
  note: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  reimbursedAt: string | null;
  category: { id: string; name: string; nameAr: string | null; icon: string; color: string };
  submittedBy: { id: string; name: string; nameAr: string | null; avatarColor: string | null };
  decidedBy: { id: string; name: string; nameAr: string | null } | null;
}

export function ClaimDetail({
  slug,
  now,
  viewerId,
  claim,
  files,
  thread,
  categories,
  canEdit,
  canDelete,
  canDecide,
  canApproveAny,
}: {
  slug: string;
  now: string;
  viewerId: string;
  claim: ClaimData;
  files: GalleryFile[];
  thread: ThreadItem[];
  categories: CategoryOption[];
  canEdit: boolean;
  canDelete: boolean;
  canDecide: boolean;
  canApproveAny: boolean;
}) {
  const { t, fmt, locale, dir } = useI18n();
  const reduced = useReducedMotion();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const submitter = pick(locale, claim.submittedBy.name, claim.submittedBy.nameAr);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; number?: string }>, success: MessageKey, party = false) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(t((res.error ?? "errors.generic") as MessageKey));
      toast.success(t(success, { number: claim.number }));
      if (party) celebrate(reduced);
    });

  const decided = claim.decidedBy && claim.status !== "submitted";
  const self = claim.decisionNote === "self";

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/w/${slug}/claims`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("claims.back")}
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Card className="relative overflow-hidden p-[var(--pad)] sm:p-7">
            <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: claim.category.color }} />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm text-muted">
                  <span className="font-mono">{claim.number}</span>
                  <StatusBadge status={claim.status} />
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{claim.merchant}</h1>
              </div>
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="tabular text-3xl font-semibold tracking-tight sm:text-4xl">
                {fmt.money(claim.amount, { decimals: "auto" })}
              </motion.p>
            </div>

            <dl className="mt-6 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{t("claims.category")}</dt>
                <dd className="mt-1 inline-flex items-center gap-2 font-medium">
                  <span className="grid size-7 place-items-center rounded-lg text-white" style={{ background: claim.category.color }}>
                    <CategoryIcon icon={claim.category.icon} className="size-3.5" />
                  </span>
                  {pick(locale, claim.category.name, claim.category.nameAr)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("claims.date")}</dt>
                <dd className="mt-1 font-medium">
                  {fmt.date(claim.spentOn, "long")}
                  <span className="block text-xs font-normal text-muted">{fmt.hijri(claim.spentOn)}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("claims.paidWith")}</dt>
                <dd className="mt-1 font-medium">{t(`claims.${claim.paidWith}` as MessageKey)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("claims.colBy")}</dt>
                <dd className="mt-1 inline-flex items-center gap-2 font-medium">
                  <Avatar name={claim.submittedBy.name} color={claim.submittedBy.avatarColor} size={24} />
                  {submitter} <span className="font-normal text-muted">· {fmt.relative(claim.createdAt, new Date(now))}</span>
                </dd>
              </div>
              {claim.note && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">{t("claims.note")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{claim.note}</dd>
                </div>
              )}
              {decided && (
                <div className="sm:col-span-2 rounded-xl bg-sunken/70 px-3.5 py-2.5 text-sm">
                  {self
                    ? t("claims.selfApproved")
                    : t("claims.decidedBy", { status: t(`status.${claim.status === "reimbursed" ? "approved" : claim.status}` as MessageKey), name: pick(locale, claim.decidedBy!.name, claim.decidedBy!.nameAr) })}
                  {claim.decidedAt && <span className="text-muted"> · {fmt.dateTime(claim.decidedAt)}</span>}
                  {claim.decisionNote && !self && <p className="mt-1 text-muted">“{claim.decisionNote}”</p>}
                  {claim.reimbursedAt && (
                    <p className="mt-1 text-info">
                      {t("status.reimbursed")} · {fmt.dateTime(claim.reimbursedAt)}
                    </p>
                  )}
                </div>
              )}
            </dl>

            {/* Actions */}
            <div className="no-print mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
              {canDecide && claim.status === "submitted" && (
                <>
                  <Button onClick={() => run(() => approveClaim(slug, claim.id), "claims.approved", true)} disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("claims.approve")}
                  </Button>
                  <Button variant="secondary" onClick={() => setDeclineOpen(true)} disabled={pending}>
                    <X className="size-4" /> {t("claims.decline")}
                  </Button>
                </>
              )}
              {canApproveAny && claim.status === "approved" && claim.paidWith === "cash" && (
                <Button onClick={() => run(() => reimburseClaim(slug, claim.id), "claims.reimbursed", true)} disabled={pending}>
                  <CircleDollarSign className="size-4" /> {t("claims.reimburse")}
                </Button>
              )}
              {canApproveAny && claim.status === "approved" && claim.paidWith !== "cash" && (
                <Button variant="secondary" onClick={() => run(() => reimburseClaim(slug, claim.id), "claims.reimbursed")} disabled={pending}>
                  <CircleDollarSign className="size-4" /> {t("claims.reimburse")}
                </Button>
              )}
              {canApproveAny && claim.status === "rejected" && (
                <Button variant="secondary" onClick={() => run(() => reopenClaim(slug, claim.id), "claims.reopened")} disabled={pending}>
                  <RotateCcw className="size-4" /> {t("claims.reopen")}
                </Button>
              )}
              {!canDecide && claim.status === "submitted" && claim.submittedBy.id === viewerId && canApproveAny && <p className="text-xs text-muted">{t("claims.cantApproveOwn")}</p>}
              <span className="flex-1" />
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-3.5" /> {t("claims.edit")}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => window.open(`/api/w/${slug}/export/claim?id=${claim.id}&format=print`, "_blank", "noopener")}>
                <Printer className="size-3.5" /> {t("claims.print")}
              </Button>
              {canDelete && (
                <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-3.5" /> {t("claims.delete")}
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-[var(--pad)] sm:p-7">
            <h2 className="mb-3 text-sm font-semibold">{t("claims.receipts")}</h2>
            <Gallery slug={slug} entityType="claim" entityId={claim.id} kind="receipt" files={files} canEdit={canEdit} emptyLabel={t("claims.noReceipt")} addLabel={t("claims.addReceipt")} />
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Thread slug={slug} entityType="claim" entityId={claim.id} items={thread} now={now} viewerId={viewerId} />
        </div>
      </div>

      <ClaimSheet
        slug={slug}
        open={editOpen}
        onOpenChange={setEditOpen}
        categories={categories}
        merchants={[]}
        canApprove={false}
        initial={{
          id: claim.id,
          amount: (claim.amount / 100).toFixed(2),
          merchant: claim.merchant,
          categoryId: claim.category.id,
          spentOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date(claim.spentOn)),
          paidWith: claim.paidWith,
          note: claim.note ?? "",
        }}
      />

      <Modal
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title={t("claims.declineTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim() || pending}
              onClick={() => {
                setDeclineOpen(false);
                run(() => rejectClaim(slug, claim.id, reason), "claims.declined");
              }}
            >
              {t("claims.decline")}
            </Button>
          </>
        }
      >
        <Field label={t("claims.declineReason")} hint={t("claims.declineReasonHint", { name: submitter })} htmlFor="reason">
          <Textarea id="reason" autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("claims.deleteConfirm")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                start(async () => {
                  const res = await deleteClaim(slug, claim.id);
                  if (res.ok) {
                    toast.success(t("claims.deleted"));
                    router.push(`/w/${slug}/claims`);
                  }
                })
              }
            >
              <Trash2 className="size-4" /> {t("claims.delete")}
            </Button>
          </>
        }
      />
    </div>
  );
}
