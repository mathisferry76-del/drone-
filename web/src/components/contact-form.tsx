"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function ContactForm() {
  const [sent, setSent] = React.useState(false);

  if (sent) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-border p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 font-heading text-lg font-semibold">Message envoyé</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Notre équipe vous répond sous 24h ouvrées.
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-name">Nom</Label>
          <Input id="contact-name" name="name" required autoComplete="name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-email">E-mail</Label>
          <Input id="contact-email" name="email" type="email" required autoComplete="email" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-subject">Sujet</Label>
        <Input id="contact-subject" name="subject" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea id="contact-message" name="message" required />
      </div>
      <Button type="submit" variant="accent" size="lg" className="w-fit">
        Envoyer le message
      </Button>
    </form>
  );
}
