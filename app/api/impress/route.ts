import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "crypto";
import { PLAN_AI_CAPS, PaidPlan } from "@/lib/presets";
import { getOpenAI } from "@/lib/openai";
import { getGeminiKey, editImageWithGemini, GeminiApiError, describeGeminiError } from "@/lib/gemini";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_DESCRIPTION = 400;

function currentMonthId(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// "Impressionne tes potes" is deliberately the opposite brief of the
// thumbnail presets: those push dramatic, stylized regeneration. Here the
// user described a real complaint from testing the thumbnail AI on regular
// photos — over-eager edits that look "cramé" (torched/overcooked). So the
// prompt's whole job is restraint: change exactly the one thing asked,
// touch nothing else, stay believable.
function buildImpressPrompt(userDescription: string): string {
  return `Tu es un retoucheur photo professionnel spécialisé dans les retouches ultra-réalistes et discrètes. L'utilisateur va décrire UN SEUL changement précis à apporter à cette photo.

Règles strictes :
- Applique exactement le changement demandé, rien d'autre.
- Ne change ni l'éclairage général, ni les couleurs, ni le style, ni le cadrage, ni aucun élément de la photo qui n'est pas mentionné.
- Le résultat doit rester parfaitement photoréaliste et crédible, comme si l'élément modifié avait toujours fait partie de la photo — respecte la perspective, l'échelle, l'éclairage et les ombres déjà présents dans la scène.
- N'en fais pas trop : pas de sur-retouche, pas de saturation excessive, pas d'effet "généré par IA" visible. Le but est que la photo ait l'air vraie, pas transformée.
- N'ajoute aucun texte, lettre ou chiffre à l'image.

Changement demandé : ${userDescription}`;
}

function describeAiError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    switch (err.status) {
      case 401:
        return "Clé OpenAI invalide ou expirée.";
      case 403:
        return "Accès refusé par OpenAI : organisation non vérifiée pour gpt-image-1.";
      case 429:
        return "Quota OpenAI atteint ou compte sans crédit.";
      case 400:
        return `Photo refusée par OpenAI (${err.message || "requête invalide"}). Essaie une autre photo.`;
      default:
        return `Erreur OpenAI (${err.status ?? "inconnue"}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant la retouche.";
}

export async function POST(req: NextRequest) {
  if (isRateLimited(`impress:${getClientIp(req)}`, 15, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Connecte-toi et choisis un plan pour utiliser cette fonctionnalité." },
      { status: 401 }
    );
  }

  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json(
      { error: "Connecte-toi et choisis un plan pour utiliser cette fonctionnalité." },
      { status: 401 }
    );
  }

  const { data } = await admin.from("profiles").select("*").eq("id", authUser.id).single();
  const profile = data as Profile | null;
  if (!profile) {
    return NextResponse.json(
      { error: "Profil introuvable. Déconnecte-toi puis reconnecte-toi." },
      { status: 401 }
    );
  }

  const isOwnerAccount = authUser.email?.toLowerCase() === "mathis.ferry76@gmail.com";
  // No free trial here, unlike the thumbnail tool — this is a paid-plan
  // perk from the start, gated the same way a locked feature would be.
  if (!isOwnerAccount && profile.plan === "free") {
    return NextResponse.json(
      {
        error: "« Impressionne tes potes » est réservé aux abonnés. Choisis un plan sur /pricing.",
      },
      { status: 403 }
    );
  }

  const monthKey = currentMonthId();
  let reservation: string | null = null;

  async function releaseReservationIfNeeded() {
    if (!reservation || !admin) return;
    if (reservation !== "ok_trial" && reservation !== "ok_ai") return;
    try {
      await admin.rpc("release_generation_reservation", {
        p_user_id: authUser!.id,
        p_reservation: reservation,
        p_month_key: monthKey,
      });
    } catch (err) {
      console.error("release_generation_reservation error", err);
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image");
    const description = String(formData.get("description") ?? "").trim().slice(0, MAX_DESCRIPTION);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image trop lourde (12 Mo max)." }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json(
        { error: "Décris le changement que tu veux voir sur ta photo." },
        { status: 400 }
      );
    }

    // Shares the same monthly AI quota as the thumbnail tool rather than a
    // separate pool — one "AI generations per month" budget usable on
    // either feature, simpler than a second quota system to track and bill.
    const cap = isOwnerAccount
      ? 999999999
      : PLAN_AI_CAPS[profile.plan as PaidPlan] + profile.bonus_generations;

    const { data: reserved, error: reserveError } = await admin.rpc("reserve_generation", {
      p_user_id: authUser.id,
      p_ai_enhance: true,
      p_month_key: monthKey,
      p_ai_cap: cap,
      p_force_paid: true,
    });

    if (reserveError) {
      console.error("reserve_generation error", reserveError);
      return NextResponse.json(
        { error: "Erreur pendant la vérification du quota." },
        { status: 500 }
      );
    }

    reservation = reserved as string;
    if (reservation === "quota_exceeded" || reservation === "trial_used") {
      return NextResponse.json(
        {
          error: `Quota IA du mois atteint (${cap}/mois sur ton plan). Passe sur un plan supérieur pour continuer.`,
        },
        { status: 403 }
      );
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    let normalizedInput: Buffer;
    try {
      normalizedInput = await sharp(inputBuffer).rotate().png().toBuffer();
    } catch {
      await releaseReservationIfNeeded();
      return NextResponse.json(
        { error: "Cette photo n'a pas pu être lue par le serveur. Essaie de la réexporter en JPEG ou PNG." },
        { status: 400 }
      );
    }

    const prompt = buildImpressPrompt(description);
    const useGemini = Boolean(getGeminiKey());
    let resultBuffer: Buffer;

    try {
      if (useGemini) {
        resultBuffer = await editImageWithGemini([{ buffer: normalizedInput }], prompt);
      } else {
        const openai = getOpenAI();
        if (!openai) {
          await releaseReservationIfNeeded();
          return NextResponse.json(
            { error: "L'IA n'est pas configurée sur ce déploiement." },
            { status: 501 }
          );
        }
        const uploadable = await toFile(normalizedInput, "photo.png", { type: "image/png" });
        const result = await openai.images.edit({
          model: "gpt-image-1",
          image: uploadable,
          prompt,
          size: "1024x1024",
          quality: "high",
          input_fidelity: "high",
        });
        const b64 = result.data?.[0]?.b64_json;
        if (!b64) throw new Error("OpenAI n'a renvoyé aucune image.");
        resultBuffer = Buffer.from(b64, "base64");
      }
    } catch (err) {
      await releaseReservationIfNeeded();
      console.error(useGemini ? "gemini impress error" : "openai impress error", err);
      return NextResponse.json(
        { error: useGemini || err instanceof GeminiApiError ? describeGeminiError(err) : describeAiError(err) },
        { status: 502 }
      );
    }

    const base64 = resultBuffer.toString("base64");

    // Best-effort history save, reusing the same table/storage as the
    // thumbnail tool (marked with a distinct preset_id) so it shows up in
    // /historique too, without a second history system.
    try {
      const storagePath = `${authUser.id}/${randomUUID()}.png`;
      const { error: uploadError } = await admin.storage
        .from("thumbnails")
        .upload(storagePath, resultBuffer, { contentType: "image/png" });
      if (!uploadError) {
        await admin.from("generations").insert({
          user_id: authUser.id,
          storage_path: storagePath,
          preset_id: "impress-tes-potes",
          used_ai: true,
        });
      } else {
        console.error("impress history upload error", uploadError);
      }
    } catch (err) {
      console.error("impress history save error", err);
    }

    return NextResponse.json({ image: `data:image/png;base64,${base64}` });
  } catch (err) {
    await releaseReservationIfNeeded();
    console.error("impress error", err);
    return NextResponse.json(
      { error: "Erreur pendant la retouche. Réessaie avec une autre photo." },
      { status: 500 }
    );
  }
}
