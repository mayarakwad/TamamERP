"use client";

import { CheckCircle2, CircleDollarSign, Clock, FileEdit, XCircle } from "lucide-react";
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
