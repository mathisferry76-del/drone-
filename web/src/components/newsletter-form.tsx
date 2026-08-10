"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function NewsletterForm() {
  const [status, setStatus] = React.useState<"idle" | "done">("idle");

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setStatus("done");
      }}
    >
      {status === "done" ? (
        <p className="text-sm font-medium text-success" role="status">
          Merci ! Vérifiez votre boîte mail pour confirmer.
        </p>
      ) : (
        <>
          <label htmlFor="newsletter-email" className="sr-only">
            Adresse e-mail
          </label>
          <div className="flex gap-2">
            <Input
              id="newsletter-email"
              type="email"
              required
              placeholder="vous@exemple.fr"
              className="h-10"
            />
            <Button type="submit" size="sm" variant="accent" className="shrink-0">
              S&apos;abonner
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
