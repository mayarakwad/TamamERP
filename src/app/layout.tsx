import type { Metadata, Viewport } from "next";
import "@fontsource-variable/readex-pro";
import "./globals.css";
import { getRequestPrefs } from "@/lib/auth/dal";
import { getSystem } from "@/lib/system";
import { htmlAttributes, htmlStyle, SCHEME_SCRIPT } from "@/lib/prefs-dom";
import { AppProviders } from "@/components/providers";
import { InlineScript } from "@/components/inline-script";

// Every page here is personal (language, theme and data come from the signed-in
// person), so the root may block on the request instead of prerendering a shell.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { instanceName } = await getSystem();
  return {
    title: { default: instanceName, template: `%s · ${instanceName}` },
    description: "An ERP for businesses, schools and homes in Qatar that feels alive.",
    applicationName: instanceName,
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#141113" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const prefs = await getRequestPrefs();
  return (
    <html {...htmlAttributes(prefs)} style={htmlStyle(prefs)} suppressHydrationWarning>
      <head>
        <InlineScript html={SCHEME_SCRIPT} />
      </head>
      <body>
        <AppProviders initialPrefs={prefs}>{children}</AppProviders>
      </body>
    </html>
  );
}
