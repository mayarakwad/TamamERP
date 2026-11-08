"use client";

import type { FormField, FormSnapshot, PageContext } from "@/lib/flow/types";

// What Flow can see of the screen: the page's visible text, and the form in
// the top-most open panel (a sheet or dialog other than Flow itself). Values
// Flow suggests are typed into that form the way a person would, so the
// page's own checks still run; nothing is saved until the person saves.

const SKIP_TYPES = new Set(["hidden", "file", "submit", "button", "reset", "image", "password", "search"]);

function topDialog(): HTMLElement | null {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')].filter((d) => !d.closest("[data-flow-panel]") && !d.hasAttribute("data-flow-panel"));
  return dialogs.at(-1) ?? null;
}

function labelFor(el: HTMLElement): string {
  const id = el.getAttribute("id");
  const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  const text = (byFor?.textContent ?? el.closest("label")?.textContent ?? el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? el.getAttribute("name") ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, 80);
}

function fieldsIn(root: HTMLElement): { el: HTMLElement; field: FormField }[] {
  const out: { el: HTMLElement; field: FormField }[] = [];
  let n = 0;
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select").forEach((el) => {
    if (el.disabled || (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type))) return;
    if (el.closest("[data-flow-panel]") || el.offsetParent === null) return;
    const key = el.id || el.name || el.dataset.flowField || `f${++n}`;
    el.dataset.flowField = key;
    const type = el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : el.type;
    const value = el instanceof HTMLInputElement && el.type === "checkbox" ? String(el.checked) : el.value;
    const options = el instanceof HTMLSelectElement ? [...el.options].filter((o) => o.value).map((o) => ({ value: o.value, label: o.text.trim() })) : undefined;
    out.push({ el, field: { id: key, label: labelFor(el) || key, type, value: value.slice(0, 500), ...(options ? { options } : {}) } });
  });
  return out;
}

export function snapshotForm(): FormSnapshot | null {
  const dialog = topDialog();
  if (!dialog) return null;
  const fields = fieldsIn(dialog).map((f) => f.field);
  if (!fields.length) return null;
  const title = dialog.querySelector("h2, [data-dialog-title]")?.textContent?.trim() || document.title;
  return { title: title.slice(0, 120), fields: fields.slice(0, 50) };
}

export function snapshotPage(includeText: boolean): PageContext {
  const main = document.getElementById("content");
  const text = includeText && main ? main.innerText.replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000) : undefined;
  return { path: location.pathname + location.search, title: document.title.replace(/\s*·\s*[^·]+$/, ""), text, form: snapshotForm() };
}

function setNative(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Type Flow's suggested values into the open form, one field at a time (so
 * forms that update their state from each change see the previous value).
 * Returns how many fields were filled. */
export async function fillForm(values: Record<string, string>): Promise<number> {
  const dialog = topDialog();
  if (!dialog) return 0;
  let filled = 0;
  for (const [key, value] of Object.entries(values)) {
    const el = dialog.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-flow-field="${CSS.escape(key)}"], #${CSS.escape(key)}, [name="${CSS.escape(key)}"]`);
    if (!el) continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      if (String(el.checked) !== value) el.click();
    } else setNative(el, value);
    filled++;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 16)));
  }
  return filled;
}
