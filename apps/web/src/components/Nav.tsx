import Link from "next/link";
import { listWorkspaces, activeWorkspace } from "@/lib/workspace";
import { signOut, switchWorkspace } from "@/lib/actions";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/sources", label: "Sources" },
  { href: "/memory", label: "Memory" },
  { href: "/growth", label: "Growth" },
];

export async function Nav({ active }: { active: string }) {
  const workspaces = await listWorkspaces();
  const current = await activeWorkspace();

  return (
    <nav className="nav">
      <div className="brand">Inspyr</div>
      <div className="brand-sub">Know what to say next</div>

      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} data-active={active === l.href}>{l.label}</Link>
      ))}

      <div className="nav-group">Workspace</div>
      {workspaces.map((w) => (
        <form key={w.id} action={switchWorkspace}>
          <input type="hidden" name="workspaceId" value={w.id} />
          <button
            type="submit"
            style={{
              border: "none", background: "none", padding: "5px 8px", margin: "1px -8px",
              width: "100%", textAlign: "left", fontSize: 13.5,
              color: current?.id === w.id ? "var(--ink)" : "var(--ink-3)",
              fontWeight: current?.id === w.id ? 560 : 400,
            }}
          >
            {w.name}
          </button>
        </form>
      ))}
      <Link href="/workspaces/new" style={{ color: "var(--ink-3)" }}>+ New workspace</Link>

      <div className="nav-group">Account</div>
      <form action={signOut}>
        <button type="submit" style={{ border: "none", background: "none", padding: "5px 8px",
          margin: "1px -8px", fontSize: 13.5, color: "var(--ink-3)" }}>Sign out</button>
      </form>
    </nav>
  );
}
