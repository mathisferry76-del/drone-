import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Comparatif des offres MIN IA pour générer tes miniatures YouTube par IA — essai gratuit, plans Creator, Pro et Studio.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
