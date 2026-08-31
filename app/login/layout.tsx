import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connecte-toi à ton compte MIN IA pour créer tes miniatures.",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
