"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2, Mail, Trash2, UserPlus, X } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { Field, fieldClass, Input, inputClass } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/rbac";
import { changeRole, inviteMember, removeMember, revokeInvite } from "@/app/actions/members";

interface Member {
  id: string;
  userId: string;
  name: string;
  nameAr: string | null;
  email: string;
  avatarColor: string | null;
  role: Role;
  title: string | null;
  titleAr: string | null;
  joined: string;
  lastLogin: string | null;
}

export function MembersView({ slug, viewerId, viewerRole, roles, now, members, invites }: { slug: string; viewerId: string; viewerRole: Role; roles: Role[]; now: string; members: Member[]; invites: { id: string; email: string; role: Role; expiresAt: string }[] }) {
  const { t, fmt, locale } = useI18n();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [pending, start] = useTransition();
  const assignable = roles.filter((r) => viewerRole === "owner" || !["owner", "admin"].includes(r));
  const canTouch = (m: Member) => m.userId !== viewerId && (viewerRole === "owner" || !["owner", "admin"].includes(m.role));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("members.title")}
        subtitle={t("members.subtitle")}
        actions={
          <Button onClick={() => setInviting(true)}>
            <UserPlus className="size-4" /> {t("members.invite")}
          </Button>
        }
      />
      <Card className="divide-y divide-line">
        {members.map((m, i) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="flex flex-wrap items-center gap-4 px-[var(--pad)] py-3.5">
            <Avatar name={m.name} color={m.avatarColor} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {pick(locale, m.name, m.nameAr)} {m.userId === viewerId && <Badge tone="accent">{t("members.you")}</Badge>}
              </p>
              <p className="truncate text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>
                {m.email}
              </p>
              <p className="truncate text-xs text-subtle">
                {pick(locale, m.title ?? "", m.titleAr)}
                {m.title ? " · " : ""}
                {t("members.joined", { date: fmt.date(m.joined) })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canTouch(m) ? (
                <select
                  aria-label={t("members.role")}
                  className={cn(fieldClass, "h-9 py-0 text-sm")}
                  value={m.role}
                  disabled={pending}
                  onChange={(e) =>
                    start(async () => {
                      const res = await changeRole(slug, m.id, e.target.value);
                      if (res.ok) toast.success(t("members.roleChanged", { name: pick(locale, m.name, m.nameAr), role: t(`roles.${e.target.value}` as MessageKey) }));
                      else toast.error(t(res.error as MessageKey));
                    })
                  }
                >
                  {(assignable.includes(m.role) ? assignable : [m.role, ...assignable]).map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}` as MessageKey)}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{t(`roles.${m.role}` as MessageKey)}</Badge>
              )}
              {canTouch(m) && (
                <Button variant="ghost" size="icon" onClick={() => setRemoving(m)} aria-label={t("members.remove")}>
                  <Trash2 className="size-4 text-muted" />
                </Button>
              )}
            </div>
          </motion.div>
        ))}
      </Card>

      {invites.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold text-muted">{t("members.pending")}</h2>
          <Card className="divide-y divide-line">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-[var(--pad)] py-3">
                <span className="grid size-9 place-items-center rounded-full bg-sunken text-muted">
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="ltr" style={{ textAlign: "start" }}>
                    {inv.email}
                  </p>
                  <p className="text-xs text-muted">
                    {t(`roles.${inv.role}` as MessageKey)} · {t("members.expires", { when: fmt.relative(inv.expiresAt, new Date(now)) })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => start(async () => void ((await revokeInvite(slug, inv.id)).ok && toast.success(t("members.revoked"))))}>
                  <X className="size-3.5" /> {t("members.revoke")}
                </Button>
              </div>
            ))}
          </Card>
        </>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted">{t("members.role")}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <div key={r} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <p className="font-medium">{t(`roles.${r}` as MessageKey)}</p>
            <p className="text-xs text-muted">{t(`members.roleHelp.${r}` as MessageKey)}</p>
          </div>
        ))}
      </div>

      {inviting && <InviteDialog slug={slug} roles={assignable.filter((r) => r !== "owner" || viewerRole === "owner")} onClose={() => setInviting(false)} />}
      <Modal
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? t("members.removeConfirm", { name: pick(locale, removing.name, removing.nameAr) }) : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                start(async () => {
                  const m = removing!;
                  const res = await removeMember(slug, m.id);
                  setRemoving(null);
                  if (res.ok) toast.success(t("members.removed", { name: pick(locale, m.name, m.nameAr) }));
                  else toast.error(t(res.error as MessageKey));
                })
              }
            >
              {t("members.remove")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function InviteDialog({ slug, roles, onClose }: { slug: string; roles: Role[]; onClose: () => void }) {
  const { t } = useI18n();
  const defaultRole = roles.includes("member") ? "member" : roles.includes("employee") ? "employee" : roles[roles.length - 1];
  const [form, setForm] = useState({ email: "", role: defaultRole, title: "" });
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const create = () =>
    start(async () => {
      const res = await inviteMember(slug, form);
      if (res.ok) setLink(`${window.location.origin}${res.url}`);
      else setError({ [res.field ?? "email"]: t(res.error as MessageKey) });
    });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={link ? t("members.linkReady") : t("members.inviteTitle")}
      description={link ? t("members.linkBody", { email: form.email }) : t("members.inviteBody")}
      footer={
        link ? (
          <Button onClick={onClose}>{t("common.done")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={create} disabled={pending || !form.email}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} {t("members.createLink")}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="flex gap-2">
          <Input readOnly value={link} dir="ltr" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button variant="secondary" onClick={async () => (await navigator.clipboard.writeText(link), setCopied(true), toast.success(t("share.copied")))}>
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />} {t("share.copyLink")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={t("members.email")} error={error.email} htmlFor="inv-email">
            <Input id="inv-email" type="email" dir="ltr" className="text-start" autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("members.role")} error={error.role} htmlFor="inv-role">
              <select id="inv-role" className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}` as MessageKey)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("members.jobTitle")} htmlFor="inv-title">
              <Input id="inv-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("members.jobTitlePlaceholder")} />
            </Field>
          </div>
          <p className="text-xs text-muted">{t(`members.roleHelp.${form.role}` as MessageKey)}</p>
        </div>
      )}
    </Modal>
  );
}
