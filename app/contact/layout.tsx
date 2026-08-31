import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Une question, un bug, une suggestion ? Contacte l'équipe MIN IA.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
