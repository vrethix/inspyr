import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { WorkspaceForm } from "@/components/WorkspaceForm";

export default async function Onboarding() {
  if (!(await currentUser())) redirect("/login");
  return (
    <main className="main" style={{ margin: "0 auto" }}>
      <div className="page-head">
        <h1>Set up your first workspace</h1>
        <p className="lede">
          A workspace is one identity — its own audience, voice and strategy. The same source
          produces different opportunities in each one, so this is worth being specific about.
        </p>
      </div>
      <WorkspaceForm />
    </main>
  );
}
