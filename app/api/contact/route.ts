import { NextRequest, NextResponse } from "next/server";
import { getResend } from "@/lib/resend";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

const CATEGORIES = ["Avis", "Suggestion", "Bug", "Autre"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (isRateLimited(`contact:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de messages envoyés. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json(
      { error: "L'envoi de message n'est pas configuré sur ce déploiement (RESEND_API_KEY manquante)." },
      { status: 501 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    category?: string;
    message?: string;
  };

  const email = (body.email ?? "").trim();
  const message = (body.message ?? "").trim();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Le message ne peut pas être vide." }, { status: 400 });
  }

  const name = (body.name ?? "").trim().slice(0, 100) || "Anonyme";
  const category = CATEGORIES.includes(body.category ?? "") ? body.category! : "Autre";
  const safeMessage = message.slice(0, 5000);

  try {
    const { error } = await resend.emails.send({
      from: "MIN IA <site@min-ia.fr>",
      to: "contact@min-ia.fr",
      replyTo: email,
      subject: `[${category}] Nouveau message de ${name}`,
      text: `De : ${name} (${email})\nCatégorie : ${category}\n\n${safeMessage}`,
    });
    if (error) {
      console.error("contact email send error", error);
      return NextResponse.json(
        { error: "Impossible d'envoyer le message. Réessaie plus tard." },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("contact email error", err);
    return NextResponse.json(
      { error: "Impossible d'envoyer le message. Réessaie plus tard." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
