import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/dal";
import { DEMO_LOGINS, DEMO_PEOPLE } from "@/lib/demo/workspaces";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// Reads ?next= and the session; allowed to render at request time.
export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getViewer()) redirect("/");
  const { next } = await searchParams;
  const showDemo = process.env.SHOW_DEMO_LOGINS !== "0";
  const demo = showDemo
    ? DEMO_LOGINS.map((d) => ({ ...d, ...DEMO_PEOPLE[d.person] }))
    : [];
  return <LoginForm next={typeof next === "string" ? next : ""} demo={demo} />;
}
