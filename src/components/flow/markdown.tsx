"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Flow's answers: Markdown with tables and links. Links inside the app open
// with client navigation; others open in a new tab. Raw HTML is never rendered.

const components: Components = {
  a: ({ href, children }) => {
    if (href?.startsWith("/")) return <Link href={href} className="font-medium text-accent underline-offset-2 hover:underline">{children}</Link>;
    if (href && /^https?:\/\//.test(href))
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">
          {children}
        </a>
      );
    return <span>{children}</span>;
  },
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[0.8rem]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-sunken text-start text-xs text-muted">{children}</thead>,
  th: ({ children }) => <th className="px-2.5 py-1.5 text-start font-medium whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="border-t border-line px-2.5 py-1.5 align-top tabular-nums">{children}</td>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 ps-5">{children}</ol>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1 text-[0.95rem] font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-2.5 mb-1 font-semibold">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="my-2 border-s-2 border-accent-line ps-3 text-muted">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-sunken px-1 py-0.5 text-[0.8em]">{children}</code>,
  hr: () => <hr className="my-3 border-line" />,
};

export function FlowMarkdown({ text }: { text: string }) {
  return (
    <div dir="auto" className="text-sm break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
