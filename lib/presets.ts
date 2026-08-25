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
  },
];

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export const FREE_GENERATIONS_PER_DEVICE = 3;

export const PRICING_TIERS = [
  {
    id: "free",
    name: "Free",
    price: "0€",
    period: "",
    description: "Pour tester le produit",
    features: [
      `${FREE_GENERATIONS_PER_DEVICE} miniatures avec filigrane`,
      "Tous les styles",
      "Export HD 1280x720",
    ],
    cta: "Essayer gratuitement",
    priceId: null as string | null,
  },
  {
    id: "creator",
    name: "Creator",
    price: "19€",
    period: "/mois",
    description: "Pour un créateur solo actif",
    features: [
      "Miniatures illimitées",
      "Sans filigrane",
      "Tous les styles + nouveaux styles",
      "Export HD 1280x720",
    ],
    cta: "Choisir Creator",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR ?? null,
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "39€",
    period: "/mois",
    description: "Pour plusieurs chaînes ou une petite équipe",
    features: [
      "Tout Creator",
      "Jusqu'à 3 chaînes",
      "Amélioration IA du fond (beta)",
      "Support prioritaire",
    ],
    cta: "Choisir Pro",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? null,
  },
];
