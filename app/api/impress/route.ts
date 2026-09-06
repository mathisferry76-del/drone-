import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "crypto";
import { GENERATION_CREDIT_COST } from "@/lib/presets";
import { getOpenAI } from "@/lib/openai";
import { getGeminiKey, editImageWithGemini, describeGeminiError } from "@/lib/gemini";
import { getFalKey, editImageWithFlux, describeFalError } from "@/lib/fal";
import { getReplicateKey, editImageWithReplicate, describeReplicateError } from "@/lib/replicate";
import { pickBestImage } from "@/lib/pick-best";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { loadFont, buildWatermarkSvg } from "@/lib/watermark";

export const runtime = "nodejs";
// FLUX Kontext Max generations run ~10-20s each; CANDIDATE_COUNT of them run
// in parallel (so total time is roughly the slowest one, not the sum), plus
// a judge call afterward. Without raising this, Vercel's default function
// timeout (10s on Hobby, 15s on Pro unless configured) could silently kill
// an otherwise-successful request — this needs the higher ceiling Pro/
// Enterprise plans allow. Capped automatically to whatever the plan
// actually supports if lower.
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_DESCRIPTION = 400;
// Vercel's *actual* enforced function timeout depends on the account's plan
// and dashboard/project settings, which `maxDuration` above can only ever
// request, not guarantee — if the real ceiling turns out lower than 120s,
// the platform kills the function outright and the client gets a
// non-JSON error page, which crashes `await res.json()` client-side and
// surfaces as an opaque "Impossible de contacter le serveur" with no way to
// tell a timeout from a real network failure (see app/impress/page.tsx).
// This internal deadline fires comfortably before any plausible real
// ceiling, so a slow generation always gets a clean, specific JSON error
// (and its in-flight provider calls aborted, so nothing keeps burning
// tokens after we've already told the user it failed) instead of risking
// the platform doing it for us with no response body at all.
const GENERATION_DEADLINE_MS = 55_000;
// Generates this many independent attempts per request and keeps the best
// one (see pickBestImage) — brand/logo fidelity on named real-world objects
// is inconsistent enough between attempts that more rolls measurably
// improve the odds, at the cost of roughly quadrupling the AI spend per
// generation (~0.32€ on Replicate vs ~0.08€ for a single attempt).
const CANDIDATE_COUNT = 4;

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
- Attention en particulier à la hauteur et à l'angle réels de la caméra dans la photo d'origine (vue en plongée depuis un étage/balcon, contre-plongée au ras du sol, vue de face à hauteur d'œil...) : l'élément modifié doit être vu selon CET angle précis, jamais selon l'angle "catalogue" habituel de ce type d'objet (ex : vue 3/4 basse et dramatique typique des photos de voitures de sport). Si la photo d'origine est prise en plongée depuis en hauteur, la voiture/l'objet remplacé doit lui aussi être vu en plongée depuis en hauteur, avec le toit et le dessus visibles dans les mêmes proportions que les autres objets de la scène (comme l'autre voiture garée à côté).
- Fais aussi correspondre la taille réelle de l'élément par rapport aux objets fixes de la scène (largeur de l'allée, autre véhicule garé, portail, haie) — ne l'agrandis ni ne le réduis par rapport à ce que ces repères imposent.
- Fais correspondre précisément la direction, la couleur et la dureté de la lumière déjà visible dans la photo (heure du jour, source de lumière, ombres portées par les autres objets) — l'élément modifié doit projeter une ombre cohérente avec ces mêmes réglages, au sol ou sur les surfaces autour de lui.
- Fais correspondre le grain, la netteté et la balance des couleurs du reste de la photo — l'élément modifié ne doit jamais paraître plus net, plus flou, plus saturé ou plus lisse que le reste de l'image, sous peine de sauter aux yeux comme un ajout.
- Si l'élément est réfléchissant (carrosserie, vitre, métal, eau), reflète l'environnement réel visible sur la photo (ciel, bâtiments, végétation), jamais un décor générique ou un studio.
- Résultat attendu : une photo qui a l'air d'avoir été prise en une seule fois, jamais un montage, un collage ou un objet "posé" par-dessus l'image.

Règles de portée :
- Applique exactement le changement demandé, rien d'autre.
- Si le changement demandé est de REMPLACER un objet de la photo par un autre modèle précis (ex : "remplace ma voiture par une Ferrari 812 Superfast", "remplace mon t-shirt par une veste en cuir") : la forme, la silhouette et la structure entières de cet objet doivent changer pour correspondre au nouveau modèle — carrosserie, calandre, phares, vitres, toit pour une voiture ; coupe, col, manches pour un vêtement — jamais juste sa couleur ou sa texture en gardant la forme d'origine. Un résultat où l'objet remplacé garde la silhouette de l'objet d'origine est un ÉCHEC complet de la tâche, même si l'angle/la lumière/le cadrage sont parfaits. La règle "ne change rien d'autre" ci-dessous ne protège JAMAIS l'objet explicitement désigné par la description — elle protège uniquement le reste de la scène (décor, autres objets, personnes).
- Ne change ni l'éclairage général, ni les couleurs, ni le style, ni aucun élément de la photo qui n'est pas mentionné.
- Contrainte géométrique stricte sur le cadrage (règle séparée, encore plus importante que la précédente) : le cadrage de sortie doit correspondre EXACTEMENT au champ de vision de la photo d'entrée — même distance focale apparente, même zoom, mêmes limites de la scène visible sur les 4 bords. Si un élément (siège, banquette, portière, plafond) n'est pas visible, même partiellement, sur la photo d'origine, il ne doit PAS apparaître dans le résultat, quelle que soit la description fournie — n'élargis, ne dézoome et ne recule jamais la "caméra" virtuelle pour faire rentrer un élément décrit qui est normalement hors champ. Ignore la partie de la description concernant une zone non visible plutôt que d'élargir le cadre pour la faire rentrer.
- N'en fais pas trop : pas de sur-retouche, pas de saturation excessive, pas d'effet "généré par IA" visible.
- N'ajoute aucun texte, lettre ou chiffre à l'image.
- Si un écran numérique, un compteur ou un cadran est visible et lisible dans la photo d'origine, garde ses chiffres/icônes aussi nets et lisibles que possible dans le résultat — ne les transforme jamais en texte flou ou en symboles illisibles.

Fidélité de marque/modèle (si l'utilisateur nomme une marque et un modèle précis — voiture, montre, sac, etc.) — LE POINT LE PLUS IMPORTANT APRÈS L'INTÉGRATION PHYSIQUE :
- Ne généralise JAMAIS vers une interprétation générique de la catégorie ("un SUV sportif", "une montre de luxe"). Reproduis les traits de design réels et distinctifs de CE modèle précis : forme exacte des phares/feux et de la calandre pour une voiture, forme du boîtier/cadran/bracelet pour une montre, silhouette et matières pour un autre objet de marque.
- Le logo/emblème de la marque doit être présent, net, correctement positionné (calandre et volant/jantes pour une voiture, cadran/fermoir pour une montre) et fidèle au vrai logo de cette marque — jamais flouté, déformé, générique ou omis.
- Pousse le niveau de détail et de finition au maximum : qualité de peinture et reflets cohérents avec une carrosserie premium, design exact des jantes/étriers de frein, lignes de carrosserie, découpes et proportions caractéristiques du modèle réel, matériaux et coutures visibles pour un objet en cuir/tissu. Le rendu doit donner l'impression d'une vraie photo automobile professionnelle de ce modèle précis, pas d'un objet générique de la même catégorie avec juste la bonne couleur.
- Si un détail exact du modèle réel n'est pas certain, privilégie quand même les traits les plus reconnaissables et caractéristiques de cette marque plutôt qu'un design neutre — le résultat doit être identifiable comme ce modèle précis par quelqu'un qui le connaît, pas juste "un objet de la même catégorie".

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

    if (provider === null) {
      await releaseReservationIfNeeded();
      return NextResponse.json(
        { error: "L'IA n'est pas configurée sur ce déploiement." },
        { status: 501 }
      );
    }

    // Merges the client's own cancel (req.signal) with our internal deadline
    // into one signal so generateOnce doesn't need to know which one fired —
    // either way, in-flight provider calls get aborted the same way the
    // existing Cancel button already relies on.
    const internalController = new AbortController();
    if (req.signal.aborted) {
      internalController.abort(req.signal.reason);
    } else {
      req.signal.addEventListener("abort", () => internalController.abort(req.signal.reason), {
        once: true,
      });
    }
    let timedOut = false;
    const deadlineTimer = setTimeout(() => {
      timedOut = true;
      internalController.abort(new DOMException("Délai interne dépassé", "TimeoutError"));
    }, GENERATION_DEADLINE_MS);

    async function generateOnce(): Promise<Buffer> {
      const signal = internalController.signal;
      if (provider === "flux-fal") {
        return editImageWithFlux(normalizedInput, prompt, signal);
      }
      if (provider === "flux-replicate") {
        return editImageWithReplicate(normalizedInput, prompt, signal);
      }
      if (provider === "openai" && openai) {
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
          { signal }
        );
        const b64 = result.data?.[0]?.b64_json;
        if (!b64) throw new Error("OpenAI n'a renvoyé aucune image.");
        return Buffer.from(b64, "base64");
      }
      return editImageWithGemini([{ buffer: normalizedInput }], prompt, signal);
    }

    let resultBuffer: Buffer;

    try {
      // Runs CANDIDATE_COUNT independent generations in parallel and keeps
      // the best one instead of a single roll of the dice — cars, watches
      // and other named brands come back inconsistent enough (a crisp logo
      // on one attempt, a blurry smudge on another) that more attempts
      // measurably improve the odds of a usable result. Paid for out of
      // margin (roughly quadruples the AI cost per generation, absorbed by
      // MIN IA — the user's credit cost stays the same), not passed on to
      // the credits charged. Promise.allSettled means a candidate erroring
      // (rate limit, transient failure) doesn't sink the request as long as
      // at least one succeeds.
      const settled = await Promise.allSettled(
        Array.from({ length: CANDIDATE_COUNT }, () => generateOnce())
      );
      const successes = settled
        .filter((r): r is PromiseFulfilledResult<Buffer> => r.status === "fulfilled")
        .map((r) => r.value);

      if (successes.length === 0) {
        const firstFailure = settled.find(
          (r): r is PromiseRejectedResult => r.status === "rejected"
        );
        throw firstFailure ? firstFailure.reason : new Error("Toutes les tentatives ont échoué.");
      }

      const bestIndex = await pickBestImage(normalizedInput, successes, description);
      // null means the judge(s) agreed none of the CANDIDATE_COUNT attempts
      // actually kept the original photo's scene — e.g. the model
      // hallucinated an unrelated image instead of editing the real one.
      // Erroring out (and refunding below) beats silently shipping and
      // charging for a result that has nothing to do with the user's photo.
      if (bestIndex === null) {
        throw new Error(
          "Aucune des tentatives ne respecte assez la photo d'origine. Réessaie avec une description plus précise ou une autre photo."
        );
      }
      resultBuffer = successes[bestIndex];
      clearTimeout(deadlineTimer);
    } catch (err) {
      clearTimeout(deadlineTimer);
      // Refunds the trial/credits reservation whether the AI call genuinely
      // failed, the client aborted the request (cancel button), or our own
      // internal deadline fired — either way, no generation was delivered,
      // so nothing should be charged. Passing internalController's signal
      // into each provider call above also aborts the actual outbound
      // request to OpenAI/Gemini/fal.ai/Replicate in all three cases,
      // instead of letting it finish (and get billed) uselessly.
      await releaseReservationIfNeeded();
      if (timedOut) {
        return NextResponse.json(
          {
            error:
              "La génération a pris trop de temps et a été interrompue. Réessaie avec une photo plus légère ou une description plus courte.",
          },
          { status: 504 }
        );
      }
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
