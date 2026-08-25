export type PresetId =
  | "bold-impact"
  | "clean-minimal"
  | "neon-pop"
  | "high-contrast-drama";

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
  /** Instruction given to the AI generative enhancement (Pro plan only). */
  aiPrompt: string;
}

export const PRESETS: Preset[] = [
  {
    id: "bold-impact",
    name: "Bold Impact",
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
    name: "Clean Minimal",
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
    name: "Neon Pop",
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
    name: "High Contrast Drama",
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
];

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export const FREE_GENERATIONS_PER_DEVICE = 3;

export interface PricingTier {
  id: "free" | "creator" | "pro";
  name: string;
  price: string;
  period: string;
  tagline: string;
  description: string;
  features: string[];
  notIncluded: string[];
  cta: string;
  priceId: string | null;
  highlighted?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    price: "0€",
    period: "",
    tagline: "Pour tester l'outil",
    description:
      "Génère quelques miniatures avec les styles filtres, sans engagement, pour voir si l'outil te convient.",
    features: [
      `${FREE_GENERATIONS_PER_DEVICE} miniatures avec filigrane`,
      "4 styles filtres (couleurs, contraste, texte)",
      "Export HD 1280x720",
    ],
    notIncluded: ["Pas d'IA générative", "Filigrane sur chaque export"],
    cta: "Essayer gratuitement",
    priceId: null,
  },
  {
    id: "creator",
    name: "Creator",
    price: "19€",
    period: "/mois",
    tagline: "Pour publier régulièrement",
    description:
      "Le plan pour un créateur solo actif : génère autant de miniatures que tu veux avec les styles filtres, sans filigrane.",
    features: [
      "Miniatures illimitées",
      "Sans filigrane",
      "4 styles filtres + nouveaux styles à venir",
      "Export HD 1280x720",
    ],
    notIncluded: ["Pas d'IA générative (le fond reste ta photo filtrée)"],
    cta: "Choisir Creator",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR ?? null,
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "39€",
    period: "/mois",
    tagline: "Pour un rendu qui se démarque vraiment",
    description:
      "Tout Creator, plus une vraie IA générative qui retravaille l'image (lumière, ambiance, décor) au lieu d'un simple filtre de couleur.",
    features: [
      "Tout Creator",
      "IA générative d'image : transforme réellement la photo (éclairage, ambiance, décor), pas juste un filtre",
      "Jusqu'à 3 chaînes",
      "Support prioritaire",
    ],
    notIncluded: [],
    cta: "Choisir Pro",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? null,
  },
];
