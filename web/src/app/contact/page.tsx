import type { Metadata } from "next";
import { Mail, Phone, MapPin } from "lucide-react";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Une question sur un drone ou une commande ? Contactez l'équipe SkyForge.",
};

const contactPoints = [
  { icon: Mail, label: "E-mail", value: "contact@skyforge-drones.fr" },
  { icon: Phone, label: "Téléphone", value: "01 23 45 67 89" },
  { icon: MapPin, label: "Showroom", value: "12 rue de l'Aéropostale, 31000 Toulouse" },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold sm:text-4xl">Contactez-nous</h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        Une question avant d&apos;acheter, un besoin de conseil technique ou un suivi de
        commande ? Notre équipe de pilotes vous répond.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ContactForm />
        </div>

        <ul className="flex flex-col gap-5">
          {contactPoints.map(({ icon: Icon, label, value }) => (
            <li key={label} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{value}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
