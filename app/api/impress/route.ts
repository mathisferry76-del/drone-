import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "crypto";
import { GENERATION_CREDIT_COST } from "@/lib/presets";
import { getOpenAI } from "@/lib/openai";
import { getGeminiKey, editImageWithGemini, describeGeminiError } from "@/lib/gemini";
import { getFalKey, editImageWithFlux, describeFalError } from "@/lib/fal";
import { getReplicateKey, editImageWithReplicate, describeReplicateError } from "@/lib/replicate";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { loadFont, buildWatermarkSvg } from "@/lib/watermark";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_DESCRIPTION = 400;

// "Impressionne tes potes" is deliberately the opposite brief of the
// thumbnail presets: those push dramatic, stylized regeneration. Here the
// user described two real complaints from testing on regular photos:
// over-eager edits that look "cramé" (torched/overcooked), and — after that
// was fixed — inserted objects that look pasted-in rather than physically
// part of the scene (wrong light direction/color, no matching shadow,
// mismatched sharpness). The generic "stay realistic, respect the
// lighting" instruction wasn't specific enough for the model to actually
// do that; this spells out the exact physical cues to match, mirroring the
// more detailed AI_QUALITY_DIRECTIVE language already proven to work for
// the thumbnail presets (see lib/presets.ts), adapted from "regenerate the
// whole background" to "insert one object convincingly."
function buildImpressPrompt(userDescription: string): string {
  return `Tu es un retoucheur photo professionnel spécialisé en compositing photoréaliste niveau VFX cinéma, pas en génération d'image générique. L'utilisateur va décrire UN SEUL changement précis à apporter à cette photo réelle.

Règles d'intégration physique (le plus important, cause principale de résultats ratés) :
- Respecte EXACTEMENT la perspective, l'angle de caméra et l'échelle de la scène d'origine pour l'élément modifié — même point de fuite, même distance apparente que s'il avait été photographié sur place.
- Fais correspondre précisément la direction, la couleur et la dureté de la lumière déjà visible dans la photo (heure du jour, source de lumière, ombres portées par les autres objets) — l'élément modifié doit projeter une ombre cohérente avec ces mêmes réglages, au sol ou sur les surfaces autour de lui.
- Fais correspondre le grain, la netteté et la balance des couleurs du reste de la photo — l'élément modifié ne doit jamais paraître plus net, plus flou, plus saturé ou plus lisse que le reste de l'image, sous peine de sauter aux yeux comme un ajout.
- Si l'élément est réfléchissant (carrosserie, vitre, métal, eau), reflète l'environnement réel visible sur la photo (ciel, bâtiments, végétation), jamais un décor générique ou un studio.
- Résultat attendu : une photo qui a l'air d'avoir été prise en une seule fois, jamais un montage, un collage ou un objet "posé" par-dessus l'image.

Règles de portée :
- Applique exactement le changement demandé, rien d'autre.
- Ne change ni l'éclairage général, ni les couleurs, ni le style, ni le cadrage, ni aucun élément de la photo qui n'est pas mentionné.
- N'en fais pas trop : pas de sur-retouche, pas de saturation excessive, pas d'effet "généré par IA" visible.
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
  let reservation: string | null = null;

  async function releaseReservationIfNeeded() {
    if (!reservation || !admin) return;
    if (reservation !== "ok_trial" && reservation !== "ok_credits") return;
    try {
      await admin.rpc("release_credits_reservation", {
        p_user_id: authUser!.id,
        p_reservation: reservation,
        p_cost: GENERATION_CREDIT_COST,
      });
    } catch (err) {
      console.error("release_credits_reservation error", err);
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

    // Shares the same credits balance as the thumbnail tool rather than a
    // separate pool — one prepaid budget usable on either feature. Free
    // accounts get exactly one trial use here too (mirroring /api/generate),
    // watermarked below — this is the flagship feature's first taste, so it
    // can't be paid-only from the very first try.
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_credits", {
      p_user_id: authUser.id,
      p_cost: GENERATION_CREDIT_COST,
      p_force_paid: isOwnerAccount,
    });

    if (reserveError) {
      console.error("reserve_credits error", reserveError);
      return NextResponse.json(
        { error: "Erreur pendant la vérification des crédits." },
        { status: 500 }
      );
    }

    reservation = reserved as string;
    if (reservation === "insufficient_credits") {
      return NextResponse.json(
        {
          error: `Crédits insuffisants (il faut ${GENERATION_CREDIT_COST} crédits). Achète un pack sur /pricing pour continuer.`,
        },
        { status: 403 }
      );
    }
    const effectiveWatermark = reservation === "ok_trial";

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

    // gpt-image-1's edit endpoint only offers 3 fixed canvases (square,
    // landscape 3:2, portrait 2:3) — always sending "1024x1024" squeezed
    // every non-square photo (portrait phone shots especially) into a
    // square, visibly distorting it. Picking whichever of the 3 is closest
    // to the actual photo's own aspect ratio keeps a phone photo tall, a
    // landscape photo wide, and only forces a real square photo into
    // "1024x1024" — never a shape the photo wasn't already close to.
    const inputMeta = await sharp(normalizedInput).metadata();
    const inputAspect = (inputMeta.width ?? 1) / (inputMeta.height ?? 1);
    const openAiEditSize: "1024x1024" | "1024x1536" | "1536x1024" =
      inputAspect > 1.15 ? "1536x1024" : inputAspect < 0.87 ? "1024x1536" : "1024x1024";

    const prompt = buildImpressPrompt(description);
    // Provider priority for this route, most-to-least realistic for "insert
    // one real-world object into an existing photo without touching the
    // rest": FLUX.1 Kontext [Max] first — the exact same model hosted on
    // either fal.ai (see lib/fal.ts) or Replicate (see lib/replicate.ts),
    // whichever has a working key configured; fal.ai wins if both are set,
    // for no reason other than it was wired up first. Then OpenAI's
    // gpt-image-1 (its input_fidelity "high" edit pipeline, still solid but
    // boxed into 3 fixed canvases), then Gemini as a last-resort fallback.
    // Each is only used when the one(s) before it aren't configured on this
    // deployment — not a runtime retry chain, so a mid-request failure
    // surfaces as an error rather than silently billing a second provider.
    const openai = getOpenAI();
    const provider: "flux-fal" | "flux-replicate" | "openai" | "gemini" | null = getFalKey()
      ? "flux-fal"
      : getReplicateKey()
      ? "flux-replicate"
      : openai
      ? "openai"
      : getGeminiKey()
      ? "gemini"
      : null;
    let resultBuffer: Buffer;

    try {
      if (provider === "flux-fal") {
        resultBuffer = await editImageWithFlux(normalizedInput, prompt, req.signal);
      } else if (provider === "flux-replicate") {
        resultBuffer = await editImageWithReplicate(normalizedInput, prompt, req.signal);
      } else if (provider === "openai" && openai) {
        const uploadable = await toFile(normalizedInput, "photo.png", { type: "image/png" });
        const result = await openai.images.edit(
          {
            model: "gpt-image-1",
            image: uploadable,
            prompt,
            size: openAiEditSize,
            quality: "high",
            input_fidelity: "high",
          },
          { signal: req.signal }
        );
        const b64 = result.data?.[0]?.b64_json;
        if (!b64) throw new Error("OpenAI n'a renvoyé aucune image.");
        resultBuffer = Buffer.from(b64, "base64");
      } else if (provider === "gemini") {
        resultBuffer = await editImageWithGemini([{ buffer: normalizedInput }], prompt, req.signal);
      } else {
        await releaseReservationIfNeeded();
        return NextResponse.json(
          { error: "L'IA n'est pas configurée sur ce déploiement." },
          { status: 501 }
        );
      }
    } catch (err) {
      // Refunds the trial/credits reservation whether the AI call genuinely
      // failed or the client aborted the request (cancel button) — either
      // way, no generation was delivered, so nothing should be charged.
      // Passing req.signal into each provider call above also aborts the
      // actual outbound request to OpenAI/Gemini/fal.ai when the client
      // cancels, instead of letting it finish (and get billed) uselessly.
      await releaseReservationIfNeeded();
      if (req.signal.aborted) {
        return NextResponse.json({ error: "Génération annulée." }, { status: 499 });
      }
      console.error(`${provider} impress error`, err);
      const message =
        provider === "flux-fal"
          ? describeFalError(err)
          : provider === "flux-replicate"
          ? describeReplicateError(err)
          : provider === "gemini"
          ? describeGeminiError(err)
          : describeAiError(err);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (effectiveWatermark) {
      const meta = await sharp(resultBuffer).metadata();
      const font = await loadFont();
      resultBuffer = await sharp(resultBuffer)
        .composite([
          {
            input: Buffer.from(
              buildWatermarkSvg(font, "MIN IA — essai gratuit", meta.width ?? 1024, meta.height ?? 1024)
            ),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer();
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
