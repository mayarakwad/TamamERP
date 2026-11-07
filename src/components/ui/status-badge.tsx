"use client";

import { AlertTriangle, ArrowRightLeft, Ban, CheckCircle2, CircleDashed, CircleDollarSign, CircleDot, Clock, FileEdit, PackageCheck, Send, XCircle } from "lucide-react";
import { useI18n } from "@/components/providers";
import type { MessageKey } from "@/lib/i18n";
import { Badge } from "./badge";

const STATUS: Record<string, { tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info"; icon: typeof Clock }> = {
  draft: { tone: "neutral", icon: FileEdit },
  submitted: { tone: "warning", icon: Clock },
  approved: { tone: "success", icon: CheckCircle2 },
  rejected: { tone: "danger", icon: XCircle },
  reimbursed: { tone: "info", icon: CircleDollarSign },
  due: { tone: "warning", icon: Clock },
  paid: { tone: "success", icon: CheckCircle2 },
  skipped: { tone: "neutral", icon: XCircle },
  sent: { tone: "info", icon: Send },
  accepted: { tone: "success", icon: CheckCircle2 },
  declined: { tone: "danger", icon: XCircle },
  converted: { tone: "info", icon: ArrowRightLeft },
  issued: { tone: "accent", icon: CircleDot },
  posted: { tone: "accent", icon: CircleDot },
  open: { tone: "accent", icon: CircleDot },
  partial: { tone: "warning", icon: CircleDashed },
  partReceived: { tone: "warning", icon: CircleDashed },
  overdue: { tone: "danger", icon: AlertTriangle },
  void: { tone: "neutral", icon: Ban },
  cancelled: { tone: "neutral", icon: Ban },
  received: { tone: "success", icon: PackageCheck },
  billed: { tone: "info", icon: CheckCircle2 },
  active: { tone: "success", icon: CheckCircle2 },
  terminated: { tone: "neutral", icon: Ban },
};

/** Status with colour, icon and label (never colour alone). */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const s = STATUS[status] ?? STATUS.draft;
  const Icon = s.icon;
  return (
    <Badge tone={s.tone}>
      <Icon className="size-3" />
      {t(`status.${status}` as MessageKey)}
    </Badge>
  );
}
