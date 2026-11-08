import "server-only";
import { z } from "zod";
import { defineTool, toolError } from "./define";

// fill_form: suggests values for the form open on screen. The panel shows a
// "Fill in" button; the values go into the form in the browser and nothing
// is saved until the person saves the form themselves.

export const fillFormTool = defineTool({
  name: "fill_form",
  kind: "client",
  description:
    "Suggest values for the form the person has open (listed in the page context with field ids). Use the field ids as keys. For choice fields use one of the listed options. The person reviews the values and saves the form themselves.",
  input: z.object({ values: z.record(z.string(), z.string()).describe("field id → value") }),
  available: () => true,
  async run(ctx, { values }) {
    const form = ctx.page?.form;
    const failed = ctx.locale === "ar" ? "لا يوجد نموذج مفتوح" : "No form is open";
    if (!form?.fields.length) return toolError("No form is open on the person's screen. Ask them to open the form first, or prepare the change with a propose_ tool.", failed);
    const out: Record<string, string> = {};
    const skipped: string[] = [];
    for (const [id, raw] of Object.entries(values)) {
      const field = form.fields.find((f) => f.id === id);
      if (!field) {
        skipped.push(id);
        continue;
      }
      if (field.options?.length) {
        const v = raw.trim().toLowerCase();
        const opt = field.options.find((o) => o.value.toLowerCase() === v) ?? field.options.find((o) => o.label.toLowerCase() === v) ?? field.options.find((o) => o.label.toLowerCase().includes(v));
        if (!opt) {
          skipped.push(id);
          continue;
        }
        out[id] = opt.value;
      } else out[id] = raw;
    }
    if (!Object.keys(out).length) return toolError(`None of those fields could be filled. Field ids: ${form.fields.map((f) => f.id).join(", ")}.`, failed);
    return {
      content: { status: "Shown to the person with a Fill in button. Nothing is saved until they save the form.", filled: Object.keys(out), skipped },
      ui: {
        label: ctx.locale === "ar" ? `اقتراح قيم لنموذج «${form.title}»` : `Suggested values for “${form.title}”`,
        fill: out,
        fillLabels: Object.fromEntries(Object.keys(out).map((id) => [id, form.fields.find((f) => f.id === id)?.label ?? id])),
      },
    };
  },
});
