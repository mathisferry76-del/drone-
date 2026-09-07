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
import { looksUnchanged } from "@/lib/image-diff";
import { verifyChangeApplied } from "@/lib/verify-change";
import { detectReplacementRegion } from "@/lib/detect-replacement-region";
import { buildReplacementMask } from "@/lib/mask";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { loadFont, buildWatermarkSvg } from "@/lib/watermark";

export const runtime = "nodejs";
// Generations run ~10-20s each; several of them run in parallel per request
// (so total time is roughly the slowest one, not the sum — see
// CANDIDATE_COUNT_REPLACEMENT/_GENERAL below), plus a judge call afterward.
// Without raising this, Vercel's default function
// timeout (10s on Hobby, 15s on Pro unless configured) could silently kill
// an otherwise-successful request — this needs the higher ceiling Pro/
// Enterprise plans allow. Capped automatically to whatever the plan
// actually supports if lower.
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
// Raised from 400: a precise brand-fidelity description (exact spelling of
// a wordmark, emblem placement, paddle shifters, drive-mode selector
// labels...) routinely needs more room than 400 characters, and users
// hitting that wall silently mid-typing were the ones actively trying to
// give the AI more detail to work with — the opposite of what should be
// discouraged.
const MAX_DESCRIPTION = 1200;
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
//
// Raised from 55s, then again from 90s: the pipeline now runs two extra
// vision-model passes after the parallel generations finish — the
// pixel-diff gate is local/instant, but verifyChangeApplied
// (lib/verify-change.ts) and pickBestImage's own judge call are each a real
// network round-trip on top of however long the slowest of the 4 parallel
// generations already took, and 90s still wasn't enough headroom in
// production. Set close to the 120s ceiling requested above rather than
// nudging it up again by guesswork — leaves the most margin this route can
// have without exceeding what's already been asked of the platform.
const GENERATION_DEADLINE_MS = 105_000;
// Generates this many independent attempts per request and keeps the best
// one (see pickBestImage) — brand/logo fidelity on named real-world objects
// is inconsistent enough between attempts that more rolls measurably
// improve the odds, at the cost of a roughly proportional increase in AI
// spend per generation.
//
// Two different counts, not one: gpt-image-1 (~0.17-0.25$/image at "high"
// quality — used for the masked full-replacement path below) costs roughly
// 5x what Gemini 2.5 Flash Image costs (~0.039$/image). 3 was already
// tuned down from 4 for that pricier path specifically, after it pushed
// requests past even a 105s internal deadline in production (each attempt
// also gets its own verifyChangeApplied pass after generation, so the
// slowest-of-N generation time is only part of the critical path). Gemini's
// lower cost buys room for more rolls of the dice at roughly the same
// total spend as 3 gpt-image-1 attempts, without touching the deadline math
// that's already tuned around 3 concurrent generations.
const CANDIDATE_COUNT_REPLACEMENT = 3;
const CANDIDATE_COUNT_GENERAL = 6;

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
function buildImpressPrompt(userDescription: string, hasReferenceImage: boolean): string {
  const referenceImageNote = hasReferenceImage
    ? `

IMPORTANT — une image de référence supplémentaire t'est fournie en plus de la photo à modifier : elle montre le vrai design exact de l'objet demandé (logo, motifs gravés, cadran, texte...). Utilise-la comme modèle fidèle UNIQUEMENT pour ces détails de design de l'objet — n'utilise JAMAIS son propre décor, arrière-plan, angle de caméra, lumière ou cadrage, qui n'ont aucun rapport avec la photo à modifier. Le résultat final garde entièrement le décor et la composition de la photo à modifier ; seul l'objet inséré/remplacé doit ressembler fidèlement à ce qui est montré sur cette image de référence.`
    : "";

  return `Tu es un retoucheur photo professionnel spécialisé en compositing photoréaliste niveau VFX cinéma, pas en génération d'image générique. L'utilisateur va décrire UN SEUL changement précis à apporter à cette photo réelle.${referenceImageNote}

Règles d'intégration physique (le plus important, cause principale de résultats ratés) :
- Respecte EXACTEMENT la perspective, l'angle de caméra et l'échelle de la scène d'origine pour l'élément modifié — même point de fuite, même distance apparente que s'il avait été photographié sur place.
- Attention en particulier à la hauteur et à l'angle réels de la caméra dans la photo d'origine (vue en plongée depuis un étage/balcon, contre-plongée au ras du sol, vue de face à hauteur d'œil...) : l'élément modifié doit être vu selon CET angle précis, jamais selon l'angle "catalogue" habituel de ce type d'objet (ex : vue 3/4 basse et dramatique typique des photos de voitures de sport). Si la photo d'origine est prise en plongée depuis en hauteur, la voiture/l'objet remplacé doit lui aussi être vu en plongée depuis en hauteur, avec le toit et le dessus visibles dans les mêmes proportions que les autres objets de la scène (comme l'autre voiture garée à côté).
- Fais aussi correspondre la taille RÉELLE de l'élément par rapport aux objets fixes de la scène qui servent d'échelle — dehors : largeur de l'allée, autre véhicule garé, portail, haie ; à l'intérieur/sur une table : clavier d'ordinateur, main, autre objet posé à côté, largeur de la table. Une carte bancaire fait environ la taille d'une carte à jouer, jamais plus grande qu'un clavier d'ordinateur portable posé à côté — ne l'agrandis ni ne la réduis par rapport à ce que ces repères imposent, quelle que soit la catégorie d'objet.
- Fais correspondre précisément la direction, la couleur et la dureté de la lumière déjà visible dans la photo (heure du jour, source de lumière, ombres portées par les autres objets) — l'élément modifié doit projeter une ombre cohérente avec ces mêmes réglages, au sol ou sur les surfaces autour de lui.
- Fais correspondre le grain, la netteté et la balance des couleurs du reste de la photo — l'élément modifié ne doit jamais paraître plus net, plus flou, plus saturé ou plus lisse que le reste de l'image, sous peine de sauter aux yeux comme un ajout.
- Pour toute matière souple (cuir, alcantara, tissu, daim) : rends le MICRO-GRAIN réel de cette matière — pores et légers plis naturels du cuir, structure duveteuse et légèrement irrégulière de l'alcantara/du daim, trame visible d'un tissu — avec un fini mat à semi-mat cohérent avec un vrai matériau photographié. Une surface parfaitement lisse, uniforme et sans aucun micro-détail, même à la bonne couleur et forme, a l'air d'un rendu 3D/plastique injecté et JAMAIS d'une vraie matière — c'est un défaut aussi grave qu'une mauvaise couleur, à corriger systématiquement.
- Si l'élément est réfléchissant ou brillant (carrosserie, vitre, métal, eau, boîtier de montre, carte bancaire métallique, écran d'ordinateur éteint ou en veille), reflète l'environnement réel visible sur la photo (lumière ambiante, objets et surfaces alentour), jamais une surface plate et mate sans aucun reflet ni un décor générique de studio.
- Résultat attendu : une photo qui a l'air d'avoir été prise en une seule fois, jamais un montage, un collage ou un objet "posé" par-dessus l'image.

Règles de portée :
- Applique exactement le changement demandé, rien d'autre.
- Si le changement demandé est de REMPLACER un objet de la photo par un autre modèle précis (ex : "remplace ma voiture par une Ferrari 812 Superfast", "remplace mon t-shirt par une veste en cuir") : la forme, la silhouette et la structure entières de cet objet doivent changer pour correspondre au nouveau modèle — carrosserie, calandre, phares, vitres, toit pour une voiture ; coupe, col, manches pour un vêtement — jamais juste sa couleur ou sa texture en gardant la forme d'origine. Un résultat où l'objet remplacé garde la silhouette de l'objet d'origine est un ÉCHEC complet de la tâche, même si l'angle/la lumière/le cadrage sont parfaits. La règle "ne change rien d'autre" ci-dessous ne protège JAMAIS l'objet explicitement désigné par la description — elle protège uniquement le reste de la scène (décor, autres objets, personnes).
- Si l'utilisateur précise une couleur pour l'objet remplacé ou modifié (ex : "en noir", "rouge") : cette couleur s'applique à CET OBJET précisément, même si elle est différente de sa couleur d'origine sur la photo. La règle "ne change pas les couleurs" ci-dessous protège la balance des couleurs et l'ambiance générale de la scène (ciel, décor, tons de la lumière) — elle ne signifie jamais garder la couleur d'origine de l'objet que l'utilisateur vient justement de demander de changer.
- Ne change ni l'éclairage général, ni les couleurs, ni le style, ni aucun élément de la photo qui n'est pas mentionné.
- Contrainte géométrique stricte sur le cadrage (règle séparée, encore plus importante que la précédente) : le cadrage de sortie doit correspondre EXACTEMENT au champ de vision de la photo d'entrée — même distance focale apparente, même zoom, mêmes limites de la scène visible sur les 4 bords. Si un élément (siège, banquette, portière, plafond) n'est pas visible, même partiellement, sur la photo d'origine, il ne doit PAS apparaître dans le résultat, quelle que soit la description fournie — n'élargis, ne dézoome et ne recule jamais la "caméra" virtuelle pour faire rentrer un élément décrit qui est normalement hors champ. Ignore la partie de la description concernant une zone non visible plutôt que d'élargir le cadre pour la faire rentrer.
- N'en fais pas trop : pas de sur-retouche, pas de saturation excessive, pas d'effet "généré par IA" visible.
- N'ajoute aucun texte, lettre ou chiffre qui ne fait pas partie du design réel de l'objet demandé (pas de watermark, pas de légende, pas de texte flottant dans le décor). Ça ne concerne PAS les inscriptions qui font partie du vrai design de l'objet — voir la fidélité de marque/modèle ci-dessous pour les badges/inscriptions de modèle (ex : "RS6", "M4 Competition", "GTI", "quattro"), qui doivent au contraire être rendus avec l'orthographe exacte.
- Si un écran numérique, un compteur ou un cadran est visible et lisible dans la photo d'origine, garde ses chiffres/icônes aussi nets et lisibles que possible dans le résultat — ne les transforme jamais en texte flou ou en symboles illisibles.

Fidélité de marque/modèle (si l'utilisateur nomme une marque et un modèle précis — voiture, montre, sac, carte bancaire premium, etc.) — LE POINT LE PLUS IMPORTANT APRÈS L'INTÉGRATION PHYSIQUE :
- Ne généralise JAMAIS vers une interprétation générique de la catégorie ("un SUV sportif", "une montre de luxe", "une carte haut de gamme grise"). Reproduis les traits de design réels et distinctifs de CE modèle précis : forme exacte des phares/feux et de la calandre pour une voiture, forme du boîtier/cadran/bracelet pour une montre, silhouette et matières pour un sac, motifs gravés/guillochés en arrière-plan et portrait/emblème central pour une carte bancaire premium (ex : le profil du centurion romain sur les cartes Amex Platinum/Centurion), silhouette et matières pour un autre objet de marque.
- Pour une voiture, la CATÉGORIE DE CARROSSERIE du modèle demandé est non négociable et doit être respectée en premier (break/Avant, berline, SUV, coupé 2 portes, cabriolet...) — ex : une Audi RS6 (Avant) est un break 5 portes avec un grand hayon et un toit qui va jusqu'à l'arrière, jamais un coupé 2 portes bas et court. Si le modèle exact demandé est moins connu qu'un modèle emblématique d'une autre marque (ex : Ferrari, Lamborghini), ne dérive JAMAIS vers ce modèle emblématique par défaut — respecte la marque et la catégorie de carrosserie exactes demandées même si tu es moins sûr des détails de finition précis, plutôt que de remplacer par un supercar générique d'une autre marque bien plus célèbre.
- Pour tout objet ayant un FORMAT STANDARD connu et fixe dans la vraie vie (une carte bancaire/de fidélité fait toujours le même format rectangulaire ID-1 en orientation paysage, un smartphone/ordinateur portable a des proportions, une épaisseur et des ports/connecteurs réels précis à ce modèle) : respecte ce format et cette orientation réels exactement, ne les déforme ni ne les fais deviner approximativement. Un objet dont les proportions générales ou l'orientation ne correspondent pas à l'objet réel (ex : une carte bancaire trop carrée, ou tournée dans le mauvais sens) est un échec au même titre qu'une mauvaise catégorie de carrosserie pour une voiture — ce n'est pas un détail de finition secondaire.
- Le logo/emblème de la marque doit être présent, net, correctement positionné (calandre et volant/jantes pour une voiture, cadran/fermoir pour une montre) et fidèle au vrai logo de cette marque — jamais flouté, déformé, générique ou omis. Un logo à demi-lisible, aux contours qui bavent ou à la forme approximative (ex : un cheval cabré qui ressemble à une tache plutôt qu'à un cheval net sur l'écusson Ferrari) est un échec visible au premier coup d'œil pour n'importe qui connaît la marque — vise la précision d'un logo vectoriel reproduit à la main, pas une suggestion approximative de logo. Si tu ne peux pas rendre le logo net et reconnaissable à cette taille, privilégie une taille/zone où il l'est plutôt que de le rendre illisible.
- Pour une voiture, s'il y a un badge/inscription du nom du modèle sur la carrosserie (ex : "RS6", "M4 Competition", "GTI", "quattro", "Turbo S") : reproduis ces lettres/chiffres EXACTEMENT comme ils s'écrivent réellement, dans la bonne police (généralement des majuscules épaisses et nettes, jamais une police décorative ou manuscrite) — un badge qui ressemble à la bonne suite de lettres sans l'être précisément (ex : "RSC" au lieu de "RS6") est un échec au même titre qu'un logo flouté, pas un détail mineur qu'on peut approximer.
- Règle générale sur TOUT texte de marque (nom de la marque écrit en toutes lettres sur un écusson/emblème, un badge de modèle, un cadran...) : si tu n'es pas certain de pouvoir épeler CHAQUE lettre exactement comme le vrai nom de la marque (ex : "LAMBORGHINI", pas "LAMPOCHINI" ni aucune autre variante approximative), privilégie un rendu du logo/écusson SANS ce texte, ou avec un texte volontairement trop petit/stylisé pour être lu distinctement, plutôt que d'inventer une suite de lettres qui ressemble au bon mot sans l'être. Un texte de marque faux ou baragouiné, même sur un détail par ailleurs réussi, est un échec pire qu'un logo simplifié sans texte du tout — ne prends jamais ce risque quand un doute existe.
- Pour une montre : forme et matière EXACTES du boîtier (rond/carré/tonneau, acier/or/céramique), style et couleur précis du cadran (index, aiguilles, éventuel guichet de date, complications comme un chronographe ou une lunette tournante), et type de bracelet/maillons caractéristique du modèle réel (ex : le bracelet Oyster ou Jubilee à maillons massifs d'une Rolex, pas un bracelet fin générique) — une montre qui a la bonne couleur générale mais un boîtier/cadran/bracelet de forme différente n'est pas identifiable comme ce modèle précis.
- Pour un sac ou un article en cuir de marque : matière, couleur et surtout quincaillerie (fermoirs, boucles, couleur du métal) et motif de surface EXACTS du modèle réel (ex : le monogramme ou le damier caractéristique d'une marque, le motif matelassé d'une autre) — jamais un sac uni générique avec juste la bonne couleur et un logo approximatif dessus.
- Pour un volant de voiture de marque : forme exacte de la jante (ronde classique ou méplate en bas façon volant de sport), taille et position précises de l'emblème sur le moyeu central, présence et forme des palettes au volant si le modèle réel en a, disposition et étiquetage exacts des boutons/molettes/sélecteurs de mode de conduite montés sur le volant (ex : le sélecteur "STRADA/SPORT/CORSA" d'une Lamborghini), et couleur/matière du revêtement (cuir, alcantara) avec ses surpiqûres — un volant à la bonne couleur générale mais avec une jante, un emblème ou des commandes différents de forme n'est pas identifiable comme ce modèle précis, au même titre qu'une mauvaise calandre pour une voiture entière.
- Billets de banque / argent liquide : NE PAS essayer de reproduire un billet réel de façon photoréaliste et lisible (numéro de série, portrait, hologrammes) — les modèles d'IA refusent souvent ce genre de demande ou produisent un résultat déformé/flouté par leurs propres filtres de sécurité anti-contrefaçon, ce n'est pas un problème de prompt mais une limite volontaire du modèle. Dans ce cas précis, privilégie une liasse de billets reconnaissable comme de l'argent (couleur, texture, épaisseur du paquet) sans chercher à rendre un billet individuel parfaitement net et lisible.
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

    // Optional: a real reference photo of the exact object's design (a
    // watch dial, a card's engraved pattern...), supplied by the user
    // rather than fetched automatically — the earlier attempt at an
    // automated reference lookup for cars (a search API + an LLM call to
    // find it) added real latency and reliability risk for a benefit that
    // never panned out, and got reverted. This is the same idea scoped
    // down to "the user already has the photo, just let them attach it" —
    // no extra network calls, no detection step, purely optional. Passed
    // through to whichever provider supports multiple reference images
    // (Gemini and gpt-image-1 both do, natively — see generateOnce below);
    // silently ignored for FLUX Kontext/Replicate, which only take one.
    const referenceFile = formData.get("reference");
    let normalizedReference: Buffer | null = null;
    if (referenceFile instanceof File && referenceFile.size > 0) {
      if (referenceFile.size > MAX_UPLOAD_BYTES) {
        await releaseReservationIfNeeded();
        return NextResponse.json(
          { error: "Photo de référence trop lourde (12 Mo max)." },
          { status: 400 }
        );
      }
      try {
        normalizedReference = await sharp(Buffer.from(await referenceFile.arrayBuffer()))
          .rotate()
          .png()
          .toBuffer();
      } catch {
        await releaseReservationIfNeeded();
        return NextResponse.json(
          {
            error:
              "La photo de référence n'a pas pu être lue par le serveur. Essaie de la réexporter en JPEG ou PNG.",
          },
          { status: 400 }
        );
      }
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

    const openai = getOpenAI();

    // Even the *closest* of those 3 fixed canvases is still a real mismatch
    // for almost any real photo (a 4:3 or 16:9 phone shot is never exactly
    // 3:2) — and gpt-image-1 doesn't stretch the photo to fill that
    // mismatch, it pads the leftover space with black, baked directly into
    // the result (confirmed in production: a landscape steering-wheel
    // close-up came back with visible black bars top and bottom).
    // Centered-cropping the photo to the exact target ratio ourselves
    // first — the same fix already applied to the video pipeline for Veo's
    // analogous fixed-canvas limitation, see lib/video-crop.ts — trades a
    // sliver off the long edge for a real full-bleed result with no
    // padding. Only computed when OpenAI is even configured, since
    // whether it ends up used depends on the mask/provider logic below.
    let openAiInput = normalizedInput;
    let openAiInputMeta = inputMeta;
    if (openai) {
      const targetRatio =
        openAiEditSize === "1536x1024" ? 1536 / 1024 : openAiEditSize === "1024x1536" ? 1024 / 1536 : 1;
      const { width, height } = inputMeta;
      if (width && height) {
        const currentRatio = width / height;
        let cropWidth = width;
        let cropHeight = height;
        if (currentRatio > targetRatio) {
          cropWidth = Math.round(height * targetRatio);
        } else {
          cropHeight = Math.round(width / targetRatio);
        }
        const left = Math.round((width - cropWidth) / 2);
        const top = Math.round((height - cropHeight) / 2);
        openAiInput = await sharp(normalizedInput)
          .extract({ left, top, width: cropWidth, height: cropHeight })
          .png()
          .toBuffer();
        openAiInputMeta = await sharp(openAiInput).metadata();
      }
    }

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
    //
    // Gemini moved to the front: Gemini 2.5 Flash Image has a strong
    // reputation specifically for this kind of realistic object-in-photo
    // compositing — reflections and lighting consistency on the inserted/
    // replaced object in particular — plausibly stronger than FLUX Kontext
    // there, and it was sitting completely unused as a last-resort fallback
    // on any deployment where FAL_KEY is set (which, until now, silently
    // starved it of ever actually running here). Only takes effect where
    // GEMINI_API_KEY is actually configured; falls through to the same
    // order as before otherwise.
    const provider: "flux-fal" | "flux-replicate" | "openai" | "gemini" | null = getGeminiKey()
      ? "gemini"
      : getFalKey()
      ? "flux-fal"
      : getReplicateKey()
      ? "flux-replicate"
      : openai
      ? "openai"
      : null;

    if (provider === null) {
      await releaseReservationIfNeeded();
      return NextResponse.json(
        { error: "L'IA n'est pas configurée sur ce déploiement." },
        { status: 501 }
      );
    }

    const prompt = buildImpressPrompt(description, normalizedReference !== null);

    // For a full object-replacement request (most often a car swapped for a
    // different, differently-shaped model), route generation through
    // gpt-image-1's actual inpainting mask instead of whichever provider was
    // otherwise selected above. None of FLUX Kontext's hosts (fal.ai,
    // Replicate) expose any masking primitive at all, and in production it
    // kept a strong bias toward preserving the original object's silhouette
    // no matter how explicitly the prompt said otherwise — a pixel mask is a
    // structural constraint the model can't partially ignore the way it can
    // ignore a sentence in a prompt. Only takes effect when OpenAI is
    // configured and the detector confidently identifies both the request
    // type and the object's location (lib/detect-replacement-region.ts);
    // anything less than that and this silently falls through to the
    // existing provider flow below, unchanged.
    let replacementMask: Buffer | null = null;
    if (openai) {
      const region = await detectReplacementRegion(openAiInput, description);
      if (region) {
        replacementMask = await buildReplacementMask(
          openAiInputMeta.width ?? 1024,
          openAiInputMeta.height ?? 1024,
          region
        );
      }
    }

    // Whichever "original" this request's candidates will actually be
    // generated from — the OpenAI-canvas-cropped photo whenever generation
    // goes through gpt-image-1 (masked replacement or as the plain
    // provider), the untouched photo otherwise (FLUX Kontext/Gemini both
    // accept the photo's native aspect ratio, no fixed-canvas constraint).
    // Used consistently below for the actual generation call, the
    // pixel-diff gate and the fidelity judge, so every comparison is made
    // against the same frame the model actually saw.
    const usesOpenAiEditPath = Boolean(replacementMask) || provider === "openai";
    const generationInput = usesOpenAiEditPath ? openAiInput : normalizedInput;

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

    // The true "before" frame every candidate is judged against — see
    // generationInput above (the OpenAI-canvas-cropped photo on that path,
    // the untouched photo otherwise).
    const generationInputMeta = usesOpenAiEditPath ? openAiInputMeta : inputMeta;
    const generationRatio = (generationInputMeta.width ?? 1) / (generationInputMeta.height ?? 1);

    // Defensive backstop against ANY provider silently returning an image
    // whose aspect ratio doesn't match what was actually sent — confirmed
    // for gpt-image-1's 3 fixed canvases (handled above by pre-cropping the
    // input to match exactly), but Gemini 2.5 Flash Image has no documented
    // output-size guarantee at all and no aspect-ratio parameter to pin it
    // down, unlike FLUX Kontext's explicit "match_input_image" — so a
    // mismatch there would slip through unnoticed and come back as visible
    // black letterboxing, exactly what showed up in production on a
    // steering-wheel result even after the gpt-image-1-specific fix.
    // Cropping (never stretching) whichever axis grew is the same
    // assumption already validated for gpt-image-1: the real photo content
    // isn't shrunk, only the canvas around it is padded, so trimming that
    // padding back off recovers a genuine full-bleed result instead of a
    // shrunk one. A near-exact match (within 2%, ordinary rounding) is left
    // untouched rather than trimmed for no reason.
    async function matchGenerationAspect(candidate: Buffer): Promise<Buffer> {
      const meta = await sharp(candidate).metadata();
      const { width, height } = meta;
      if (!width || !height) return candidate;
      const currentRatio = width / height;
      if (Math.abs(currentRatio - generationRatio) / generationRatio < 0.02) return candidate;
      let cropWidth = width;
      let cropHeight = height;
      if (currentRatio > generationRatio) {
        cropWidth = Math.round(height * generationRatio);
      } else {
        cropHeight = Math.round(width / generationRatio);
      }
      const left = Math.round((width - cropWidth) / 2);
      const top = Math.round((height - cropHeight) / 2);
      return sharp(candidate)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .png()
        .toBuffer();
    }

    async function generateOnceRaw(): Promise<Buffer> {
      const signal = internalController.signal;
      // The mask takes priority over normal provider selection whenever
      // it's available (see replacementMask above) — even when FLUX Kontext
      // is the configured provider, gpt-image-1's real inpainting mask is
      // the better tool for a full object-replacement request specifically.
      if (replacementMask || provider === "openai") {
        if (!openai) throw new Error("OpenAI n'est pas configuré (OPENAI_API_KEY manquante).");
        const uploadable = await toFile(generationInput, "photo.png", { type: "image/png" });
        // gpt-image-1's edit endpoint natively accepts multiple input images
        // (image: Uploadable | Array<Uploadable>) — a documented, stable
        // capability, not the "experimental" multi-image mode that caused
        // problems on FLUX Kontext. A mask, when present, always applies to
        // the first image (the user's own photo) regardless of how many
        // follow it.
        const referenceUploadable = normalizedReference
          ? await toFile(normalizedReference, "reference.png", { type: "image/png" })
          : null;
        const image = referenceUploadable ? [uploadable, referenceUploadable] : uploadable;
        const maskUploadable = replacementMask
          ? await toFile(replacementMask, "mask.png", { type: "image/png" })
          : undefined;
        const result = await openai.images.edit(
          {
            model: "gpt-image-1",
            image,
            ...(maskUploadable ? { mask: maskUploadable } : {}),
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
      if (provider === "flux-fal") {
        return editImageWithFlux(normalizedInput, prompt, signal);
      }
      if (provider === "flux-replicate") {
        return editImageWithReplicate(normalizedInput, prompt, signal);
      }
      // Gemini's generateContent natively takes multiple images in one
      // request too — same reasoning as gpt-image-1 above, just passed as a
      // second inline_data part instead of a second array element.
      const geminiImages = normalizedReference
        ? [{ buffer: normalizedInput }, { buffer: normalizedReference }]
        : [{ buffer: normalizedInput }];
      return editImageWithGemini(geminiImages, prompt, signal);
    }

    async function generateOnce(): Promise<Buffer> {
      const raw = await generateOnceRaw();
      return matchGenerationAspect(raw);
    }

    let resultBuffer: Buffer;
    let resultImperfect = false;

    try {
      // Runs several independent generations in parallel and keeps the best
      // one instead of a single roll of the dice — cars, watches and other
      // named brands come back inconsistent enough (a crisp logo on one
      // attempt, a blurry smudge on another) that more attempts measurably
      // improve the odds of a usable result. Paid for out of margin,
      // absorbed by MIN IA — the user's credit cost stays the same. Count
      // depends on which path this request is on (see
      // CANDIDATE_COUNT_REPLACEMENT/_GENERAL above). Promise.allSettled
      // means a candidate erroring (rate limit, transient failure) doesn't
      // sink the request as long as at least one succeeds.
      const candidateCount = replacementMask ? CANDIDATE_COUNT_REPLACEMENT : CANDIDATE_COUNT_GENERAL;
      const settled = await Promise.allSettled(
        Array.from({ length: candidateCount }, () => generateOnce())
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

      // Deterministic pixel-level backstop, ahead of the LLM judge: FLUX
      // Kontext occasionally returns a candidate that's essentially the
      // unedited input photo, and the judge (asked to catch this among
      // several other criteria) doesn't reliably reject it every time —
      // confirmed in production, twice. Whether a candidate changed at all
      // is answerable by comparing pixels directly, so filter those out
      // before the judge ever sees them rather than trusting its rubric for
      // this specific case too.
      const changedFlags = await Promise.all(
        successes.map((buf) => looksUnchanged(generationInput, buf).then((u) => !u))
      );
      const changedSuccesses = successes.filter((_, i) => changedFlags[i]);

      if (changedSuccesses.length === 0) {
        throw new Error(
          "L'IA n'a appliqué aucune modification visible à la photo. Réessaie avec une description plus précise ou une autre photo."
        );
      }

      // Second, narrower verification pass ahead of the ranking judge — the
      // pixel-diff gate above only proves *something* changed, not that the
      // *right* thing changed. Confirmed in production: a candidate that
      // only recolors the original object (same Renault, repainted black)
      // instead of actually becoming the requested model (a BMW M4) passed
      // both the pixel-diff gate (color is a real, substantial change) and
      // pickBestImage's own rejection criteria. A single-image, single yes/
      // no question ("was the actual requested object produced") is a much
      // smaller ask for a cheap vision model than the multi-criteria,
      // multi-image rubric pickBestImage runs, so give it its own pass
      // instead of folding it into that one. false is the only verdict that
      // discards a candidate — true or an unclear/failed check (null) both
      // let it through, so a flaky verification call never costs the user a
      // generation that would otherwise have been fine.
      const verifiedFlags = await Promise.all(
        changedSuccesses.map((buf) => verifyChangeApplied(buf, description))
      );
      const verifiedSuccesses = changedSuccesses.filter((_, i) => verifiedFlags[i] !== false);

      if (verifiedSuccesses.length === 0) {
        throw new Error(
          "L'IA n'a pas réussi à appliquer fidèlement le changement demandé (l'objet a changé de couleur/finition sans devenir le modèle exact demandé). Réessaie avec une description plus précise ou une autre photo."
        );
      }

      const { index: bestIndex, imperfect } = await pickBestImage(
        generationInput,
        verifiedSuccesses,
        description
      );
      // imperfect means every judge that actually answered flagged every
      // candidate as failing the fidelity/correct-change criteria — e.g. the
      // model didn't quite nail the exact requested model/brand. Previously
      // this hard-failed and refunded, discarding every candidate with no
      // way to tell what went wrong. Now the least-bad candidate still ships,
      // flagged for the client to show with a warning, so the user gets a
      // result instead of nothing and the failure stays diagnosable.
      resultImperfect = imperfect;
      resultBuffer = verifiedSuccesses[bestIndex];
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

    return NextResponse.json({
      image: `data:image/png;base64,${base64}`,
      // Set when no judge could confirm this result actually respects the
      // original photo / the exact requested change — the client shows a
      // warning banner instead of presenting it as a clean success.
      imperfect: resultImperfect || undefined,
    });
  } catch (err) {
    await releaseReservationIfNeeded();
    console.error("impress error", err);
    return NextResponse.json(
      { error: "Erreur pendant la retouche. Réessaie avec une autre photo." },
      { status: 500 }
    );
  }
}
