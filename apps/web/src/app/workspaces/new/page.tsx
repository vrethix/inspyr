import { Nav } from "@/components/Nav";
import { WorkspaceForm } from "@/components/WorkspaceForm";

export default function NewWorkspace() {
  return (
    <div className="shell">
      <Nav active="" />
      <main className="main">
        <div className="page-head">
          <h1>New workspace</h1>
          <p className="lede">A separate identity with its own memory. Nothing is shared across workspaces.</p>
        </div>
        <WorkspaceForm />
      </main>
    </div>
  );
}
