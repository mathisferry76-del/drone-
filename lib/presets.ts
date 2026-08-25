export type PresetId =
  | "bold-impact"
  | "clean-minimal"
  | "neon-pop"
  | "high-contrast-drama"
  | "retro-vintage"
  | "pastel-soft"
  | "cyberpunk"
  | "nature-vive"
  | "golden-vacation";

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
];

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export const FREE_GENERATIONS_PER_DEVICE = 3;
export const CREATOR_AI_MONTHLY_LIMIT = 2;

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
      "9 styles filtres (couleurs, contraste, texte)",
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
      "Le plan pour un créateur solo actif : miniatures illimitées avec les styles filtres, sans filigrane, plus un peu d'IA générative chaque mois.",
    features: [
      "Miniatures illimitées",
      "Sans filigrane",
      "9 styles filtres + nouveaux styles à venir",
      `IA générative : ${CREATOR_AI_MONTHLY_LIMIT} générations par mois`,
      "Export HD 1280x720",
    ],
    notIncluded: [`IA générative limitée à ${CREATOR_AI_MONTHLY_LIMIT}/mois (illimitée en Pro)`],
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
      "Tout Creator, avec l'IA générative en illimité pour retravailler l'image (lumière, ambiance, décor) autant de fois que tu veux.",
    features: [
      "Tout Creator",
      "IA générative d'image illimitée : transforme réellement la photo (éclairage, ambiance, décor), pas juste un filtre",
      "Jusqu'à 3 chaînes",
      "Support prioritaire",
    ],
    notIncluded: [],
    cta: "Choisir Pro",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? null,
  },
];
