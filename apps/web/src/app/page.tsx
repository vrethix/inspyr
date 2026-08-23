import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const ws = await activeWorkspace();
  redirect(ws ? "/today" : "/onboarding");
}
