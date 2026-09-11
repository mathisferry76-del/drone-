export type PresetId =
  | "bold-impact"
  | "clean-minimal"
  | "neon-pop"
  | "high-contrast-drama"
  | "retro-vintage"
  | "pastel-soft"
  | "cyberpunk"
  | "nature-vive"
  | "golden-vacation"
  | "realiste";

export interface Preset {
  id: PresetId;
  name: string;
  description: string;
  brightness: number;
  saturation: number;
  contrastA: number;
  contrastB: number;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  gradientFrom: string;
  gradientTo: string;
  gradientOpacity: number;
  /** Instruction given to the AI generative enhancement (Creator & Pro). */
  aiPrompt: string;
}

// Appended to every preset's aiPrompt. Pushes gpt-image-1 toward the
// polished, seamlessly-composited look of top-tier YouTube thumbnails
// (matched lighting/color between subject and background, not a visible
// cutout) instead of a generic "nice photo" edit, and explicitly protects
// the subject's likeness, which generative edits otherwise tend to drift.
export const AI_QUALITY_DIRECTIVE =
  "Render this as premium commercial editorial photography: shot on a high-end camera, tack-sharp focus on the subject, professional studio or location lighting, the production value of a top-tier YouTube thumbnail. Seamlessly integrate the subject into the scene — match the lighting direction, color temperature, contact shadows and reflections between the subject and the background so the whole image reads as one real photograph, never as a visible cutout or collage. Preserve the subject's exact facial features, likeness, skin texture and expression with high fidelity — do not beautify, smooth, or alter their face.";

// Base radii (as a fraction of the photo's width/height) of the "face zone"
// ellipse the user positions on their photo before an AI generation. Shared
// between the editor (to draw the marker in the right place/size) and the
// API route (to build the actual pixel mask handed to OpenAI), so the
// preview the user drags always matches the area that really gets locked.
export const FACE_ZONE_BASE_RX = 0.15;
export const FACE_ZONE_BASE_RY = 0.24;

// Same idea, but for the general-purpose "zone à retoucher" — a region the
// user marks for a targeted local edit (tone down a color, nudge an object)
// instead of a full regeneration. Squarer and roomier by default since it
// can target anything, not just a face.
export const EDIT_ZONE_BASE_RX = 0.18;
export const EDIT_ZONE_BASE_RY = 0.18;

export const PRESETS: Preset[] = [
  {
    id: "bold-impact",
    name: "Impact Maximal",
    description: "Couleurs saturées, texte jaune épais avec contour noir — style MrBeast.",
    brightness: 1.05,
    saturation: 1.55,
    contrastA: 1.18,
    contrastB: -18,
    textColor: "#FFE000",
    strokeColor: "#000000",
    strokeWidth: 10,
    gradientFrom: "rgba(0,0,0,0)",
    gradientTo: "rgba(0,0,0,0.75)",
    gradientOpacity: 0.85,
    aiPrompt:
      "Transform the background into a vibrant, high-energy scene with dynamic lighting and bold saturated colors, like a viral MrBeast-style YouTube thumbnail. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "clean-minimal",
    name: "Épuré",
    description: "Look épuré, texte blanc fin, dégradé discret — pour un contenu pro/lifestyle.",
    brightness: 1.02,
    saturation: 0.95,
    contrastA: 1.05,
    contrastB: -5,
    textColor: "#FFFFFF",
    strokeColor: "#00000055",
    strokeWidth: 2,
    gradientFrom: "rgba(0,0,0,0)",
    gradientTo: "rgba(0,0,0,0.55)",
    gradientOpacity: 0.6,
    aiPrompt:
      "Transform the background into a clean, softly lit professional studio scene with a subtle depth-of-field blur, polished and minimal. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "neon-pop",
    name: "Néon Vibrant",
    description: "Overlay violet/cyan, texte néon — pour du gaming, tech, musique.",
    brightness: 1.0,
    saturation: 1.35,
    contrastA: 1.15,
    contrastB: -10,
    textColor: "#00F0FF",
    strokeColor: "#FF00E5",
    strokeWidth: 6,
    gradientFrom: "rgba(120,0,255,0.05)",
    gradientTo: "rgba(20,0,60,0.8)",
    gradientOpacity: 0.75,
    aiPrompt:
      "Transform the background into a futuristic scene with glowing neon purple and cyan lighting, cinematic tech atmosphere. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "high-contrast-drama",
    name: "Dramatique",
    description: "Vignette sombre, contraste fort, texte blanc dramatique — storytime, docu, actu.",
    brightness: 0.95,
    saturation: 1.1,
    contrastA: 1.35,
    contrastB: -35,
    textColor: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 8,
    gradientFrom: "rgba(0,0,0,0.1)",
    gradientTo: "rgba(0,0,0,0.9)",
    gradientOpacity: 0.9,
    aiPrompt:
      "Transform the background into a dramatic, cinematic scene with deep shadows and moody documentary-style lighting. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "retro-vintage",
    name: "Rétro Vintage",
    description: "Tons chauds désaturés, grain rétro, texte orange façon pellicule — vlogs, storytime, nostalgie.",
    brightness: 1.0,
    saturation: 0.75,
    contrastA: 1.08,
    contrastB: -8,
    textColor: "#F4A340",
    strokeColor: "#3A1F0A",
    strokeWidth: 6,
    gradientFrom: "rgba(60,30,10,0.05)",
    gradientTo: "rgba(40,20,10,0.75)",
    gradientOpacity: 0.7,
    aiPrompt:
      "Transform the background into a warm, desaturated vintage film scene with retro grain and nostalgic sepia-orange tones, like an old photograph. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "pastel-soft",
    name: "Pastel Doux",
    description: "Couleurs pastel douces, contraste léger, texte rose — lifestyle, beauté, bien-être.",
    brightness: 1.08,
    saturation: 0.85,
    contrastA: 0.95,
    contrastB: 8,
    textColor: "#FF8FC7",
    strokeColor: "#FFFFFF",
    strokeWidth: 4,
    gradientFrom: "rgba(255,255,255,0)",
    gradientTo: "rgba(120,90,140,0.55)",
    gradientOpacity: 0.55,
    aiPrompt:
      "Transform the background into a soft, dreamy pastel scene with gentle light and airy tones, like a lifestyle or beauty photoshoot. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Duotone bleu/violet sombre, contraste fort, texte cyan/magenta — gaming, tech, sci-fi.",
    brightness: 0.92,
    saturation: 1.2,
    contrastA: 1.3,
    contrastB: -25,
    textColor: "#00FFC8",
    strokeColor: "#B400FF",
    strokeWidth: 7,
    gradientFrom: "rgba(10,0,40,0.1)",
    gradientTo: "rgba(5,0,30,0.9)",
    gradientOpacity: 0.85,
    aiPrompt:
      "Transform the background into a dark, moody cyberpunk cityscape with deep blue and purple tones, rain-slicked reflections and futuristic neon accents. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "nature-vive",
    name: "Nature Vive",
    description: "Verts saturés, lumière naturelle, texte blanc — vlogs outdoor, voyage, sport.",
    brightness: 1.05,
    saturation: 1.4,
    contrastA: 1.12,
    contrastB: -10,
    textColor: "#FFFFFF",
    strokeColor: "#0B3D1E",
    strokeWidth: 8,
    gradientFrom: "rgba(0,0,0,0)",
    gradientTo: "rgba(6,40,15,0.75)",
    gradientOpacity: 0.7,
    aiPrompt:
      "Transform the background into a vibrant, lush outdoor nature scene with saturated greens and natural sunlight, like an adventure or travel vlog. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "golden-vacation",
    name: "Vacances Dorées",
    description: "Tons chauds et saturés, ambiance ensoleillée — vlogs voyage, été, lifestyle extérieur.",
    brightness: 1.1,
    saturation: 1.5,
    contrastA: 1.1,
    contrastB: 5,
    textColor: "#FFD166",
    strokeColor: "#0B4F4A",
    strokeWidth: 8,
    gradientFrom: "rgba(255,140,60,0.05)",
    gradientTo: "rgba(120,50,10,0.65)",
    gradientOpacity: 0.65,
    aiPrompt:
      "Transform the background into a warm, vibrant summer vacation scene with golden sunlight, tropical or sunset colors, bright saturated warm tones. Keep the main subject clearly recognizable and photorealistic. Do not add any text, letters or numbers to the image.",
  },
  {
    id: "realiste",
    name: "Réaliste (sans filtre)",
    description: "Aucun grading couleur — juste ta photo, nette et naturelle, avec le titre par-dessus.",
    brightness: 1,
    saturation: 1,
    contrastA: 1,
    contrastB: 0,
    textColor: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 6,
    gradientFrom: "rgba(0,0,0,0)",
    gradientTo: "rgba(0,0,0,0)",
    gradientOpacity: 0,
    aiPrompt:
      "Enhance this photo to look like an extremely realistic, high-quality DSLR photograph: natural accurate colors, crisp sharp detail, correct exposure and white balance, authentic skin/material textures. Do not apply any stylized color grading, artistic filter, or unnatural lighting — the goal is maximum photorealism, as close to an untouched professional photo as possible. Keep the main subject clearly recognizable. Do not add any text, letters or numbers to the image.",
  },
];

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

// Modèle prépayé : chaque génération IA (miniature ou "Impressionne tes
// potes") coûte un nombre fixe de crédits, débités du solde du compte. Une
// génération IA coûte environ 0,25€ à 0,30€ à l'API sous-jacente — 200
// crédits (~2€ au tarif de base) laisse une marge confortable une fois les
// frais de paiement Stripe déduits. Les styles filtres (sans IA) restent
// gratuits et illimités pour tout compte connecté : leur coût serveur est
// négligeable, et ils servent de porte d'entrée vers l'achat de crédits.
export const GENERATION_CREDIT_COST = 200;

// Coût crédits pour "Impressionne tes potes" en vidéo (Seedance 2.5, clip 4s
// en 720p avec son — voir lib/replicate-video.ts ; remplace Veo 3.1/1080p,
// changement de modèle explicitement demandé) coûte réellement environ
// 0,85€-0,92€ à l'API (moins cher que Veo, qui coûtait ~1,55€), confirmé
// sur la page de prix officielle de Replicate pour ce modèle. 2500 crédits
// avait déjà été fixé pour augmenter la marge sur Veo (au tarif du pack le
// moins cher, 200cr/2€, 2500 crédits valent ~25€ facturés) ; avec le coût
// réel qui a lui-même baissé en passant à Seedance, la marge réelle est
// maintenant encore meilleure (~27x, ~96%) sans avoir eu besoin de retoucher
// ce chiffre une deuxième fois.
export const VIDEO_CREDIT_COST = 2500;

// "Éditer une vidéo" (app/api/video-edit/route.ts) : vrai video-to-video —
// on envoie une vidéo existante à Seedance 2.5 comme référence et on décrit
// le changement, au lieu d'animer une simple photo. Facturé sur le tier
// Replicate le plus cher pour ce modèle ("video_in", car une vidéo de
// référence est utilisée) : 0,9676$/s en 720p contre 0,2312$/s pour
// l'image-vers-vidéo classique. La durée de sortie suit celle de la vidéo
// envoyée (duration: -1 imposé par ce mode, voir lib/replicate-video.ts) —
// le coût réel dépend donc directement de la durée uploadée, pas d'un
// forfait fixe. Facturer un prix plat aurait sur-facturé une vidéo de 4s
// et sous-facturé une vidéo de 7s (retour explicite de l'utilisateur après
// avoir testé la fonctionnalité) : le prix suit maintenant la durée réelle,
// au prorata. Seedance impose lui-même un minimum de 4s pour ce mode
// (confirmé en production par son propre message d'erreur — pas un choix
// produit) ; MAX_EDIT_VIDEO_SECONDS plafonne le pire cas côté coût.
//
// 1000 crédits/seconde ≈ 0,90-0,92€ de coût réel par seconde au tarif du
// pack dédié le moins cher (0,0075€/crédit) — même ordre de marge
// (~7,5-8,5x) que le forfait plat précédent, mais appliqué
// proportionnellement plutôt qu'au pire cas systématiquement.
export const VIDEO_EDIT_CREDIT_COST_PER_SECOND = 1000;
export const MIN_EDIT_VIDEO_SECONDS = 4;
export const MAX_EDIT_VIDEO_SECONDS = 7;

// Arrondi au crédit supérieur — jamais sous-facturer une fraction de
// seconde réellement consommée côté API.
export function getVideoEditCreditCost(durationSeconds: number): number {
  return Math.ceil(durationSeconds * VIDEO_EDIT_CREDIT_COST_PER_SECOND);
}

export interface CreditPack {
  id: string;
  credits: number;
  price: string;
  priceId: string | null;
  tagline: string;
  highlighted?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "pack-200",
    credits: 200,
    price: "2€",
    tagline: "1 génération — pour essayer",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_200 ?? null,
  },
  {
    id: "pack-1000",
    credits: 1000,
    price: "8,99€",
    tagline: "5 générations",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_1000 ?? null,
    highlighted: true,
  },
  {
    id: "pack-3000",
    credits: 3000,
    price: "24,99€",
    tagline: "15 générations",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_3000 ?? null,
  },
  // Dédié à "Éditer une vidéo" (VIDEO_EDIT_CREDIT_COST = 6000) : les packs
  // ci-dessus plafonnent à 3000, insuffisant pour cette fonctionnalité en un
  // seul achat. Tarif dégressif par rapport au pack 3000 (0,0075€/crédit
  // contre 0,00833€), dans la continuité de la courbe des packs existants.
  {
    id: "pack-8000",
    credits: 8000,
    price: "59,99€",
    tagline: "1 édition vidéo + reste pour des générations",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_8000 ?? null,
  },
];

function parsePriceEuros(price: string): number {
  return parseFloat(price.replace("€", "").replace(",", "."));
}

function formatPriceEuros(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}€`;
}

function baseCreditRate(): number {
  const basePack = CREDIT_PACKS[0];
  return parsePriceEuros(basePack.price) / basePack.credits;
}

// Les packs sont déjà dégressifs au crédit (voir commentaire ci-dessus) mais
// ça n'était visible nulle part sur /pricing — calcule la réduction réelle
// par rapport au prix au crédit du plus petit pack, pour l'afficher en badge
// et donner une vraie raison de prendre un pack plus gros.
export function getPackDiscountPercent(pack: CreditPack): number {
  const rate = parsePriceEuros(pack.price) / pack.credits;
  return Math.round((1 - rate / baseCreditRate()) * 100);
}

// Prix que ce pack aurait coûté au tarif du plus petit pack (200 crédits),
// affiché barré à côté du vrai prix — rend la réduction concrète en euros,
// pas juste en pourcentage.
export function getPackOriginalPrice(pack: CreditPack): string {
  return formatPriceEuros(baseCreditRate() * pack.credits);
}

// Abonnements mensuels : rechargent un nombre fixe de crédits à chaque
// renouvellement, en plus du solde déjà là (les crédits ne sont jamais
// perdus, ni remis à zéro). Tarif dégressif par rapport à l'achat au pack
// (1000 crédits = 10€ à l'unité) pour récompenser l'engagement mensuel.
// Un abonné peut aussi acheter un pack ponctuel s'il a besoin de plus de
// crédits avant son prochain renouvellement.
export interface SubscriptionTier {
  id: string;
  name: string;
  price: string;
  period: string;
  credits: number;
  tagline: string;
  priceId: string | null;
  highlighted?: boolean;
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: "starter",
    name: "Starter",
    price: "15€",
    period: "/mois",
    credits: 2000,
    tagline: "≈ 10 générations par mois",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUB_STARTER ?? null,
  },
  {
    id: "creator",
    name: "Creator",
    price: "40€",
    period: "/mois",
    // Lowered from 6000 (≈30 générations) to keep worst-case gross margin
    // comfortably above the 50% floor set on the Pro tier — see the cost
    // comment there. 5200 credits (26 generations × 200) caps worst-case
    // cost at ~18.20€, for ~54.5% margin even if every generation hit the
    // expensive masked full-replacement path.
    credits: 5200,
    tagline: "≈ 26 générations par mois",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUB_CREATOR ?? null,
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "90€",
    period: "/mois",
    // Lowered from 15000 (≈75 générations): at the worst-case cost per
    // generation (~0.70€, the masked full-replacement path) 75 generations
    // only left ~42% gross margin. 12800 credits (64 generations × 200)
    // caps the worst-case cost at ~44.80€, guaranteeing at least 50% gross
    // margin on this tier even if every single generation happened to hit
    // the expensive path — the real margin will usually be higher, since
    // most generations use the much cheaper general (Gemini) path.
    credits: 12800,
    tagline: "≈ 64 générations par mois",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUB_PRO ?? null,
  },
];
