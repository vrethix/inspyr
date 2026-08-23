import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inspyr — know what to say next",
  description: "A self-learning growth engine. Watch, decide, create, publish, measure, learn.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
