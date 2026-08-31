import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Créer une miniature",
  description:
    "Upload ta photo, choisis un style et génère ta miniature YouTube optimisée pour le clic en quelques secondes.",
  alternates: { canonical: "/generate" },
};

export default function GenerateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
