import type { DroneVariant } from "@/components/drone-illustration";

export type Category = "loisir" | "camera" | "fpv" | "pro";

export const categories: { slug: Category; label: string; description: string }[] = [
  {
    slug: "loisir",
    label: "Loisir & débutant",
    description: "Simples à piloter, parfaits pour apprendre en toute confiance.",
  },
  {
    slug: "camera",
    label: "Caméra & photographie",
    description: "Stabilisation 3 axes et capteurs larges pour des images pro.",
  },
  {
    slug: "fpv",
    label: "FPV & course",
    description: "Châssis légers, réactivité maximale, pilotage en immersion.",
  },
  {
    slug: "pro",
    label: "Professionnel",
    description: "Cartographie, inspection et agriculture de précision.",
  },
];

export interface Product {
  slug: string;
  name: string;
  tagline: string;
  category: Category;
  price: number;
  compareAtPrice?: number;
  rating: number;
  reviewCount: number;
  stock: number;
  badge?: "Nouveau" | "Best-seller" | "Édition pro";
  variant: DroneVariant;
  accent: string;
  description: string;
  highlights: string[];
  specs: { label: string; value: string }[];
}

export const products: Product[] = [
  {
    slug: "aerolite-100",
    name: "AeroLite 100",
    tagline: "Le premier drone idéal, léger et increvable",
    category: "loisir",
    price: 8900,
    rating: 4.6,
    reviewCount: 312,
    stock: 48,
    badge: "Best-seller",
    variant: "quad",
    accent: "#0ea5e9",
    description:
      "Compact et ultra résistant, l'AeroLite 100 est pensé pour les premiers vols. Mode débutant avec limitation de vitesse, protections d'hélices incluses et retour automatique au décollage.",
    highlights: [
      "Mode débutant à sensibilité réduite",
      "Retour automatique (Return to Home)",
      "Protections d'hélices incluses",
      "Moins de 249 g — pas d'enregistrement requis",
    ],
    specs: [
      { label: "Autonomie", value: "18 min" },
      { label: "Portée", value: "100 m" },
      { label: "Caméra", value: "1080p" },
      { label: "Poids", value: "238 g" },
    ],
  },
  {
    slug: "aerolite-200-fpv-goggles",
    name: "AeroLite 200 Pack Découverte",
    tagline: "Drone + lunettes FPV pour débuter en immersion",
    category: "loisir",
    price: 14900,
    compareAtPrice: 16900,
    rating: 4.4,
    reviewCount: 156,
    stock: 22,
    variant: "quad",
    accent: "#0ea5e9",
    description:
      "Le pack complet pour découvrir le vol en immersion sans se ruiner : drone stable, lunettes FPV légères et transmission vidéo faible latence.",
    highlights: [
      "Lunettes FPV incluses (latence < 40 ms)",
      "3 batteries fournies (54 min de vol total)",
      "Mode altitude automatique",
      "App de suivi des vols",
    ],
    specs: [
      { label: "Autonomie", value: "18 min / batterie" },
      { label: "Portée", value: "300 m" },
      { label: "Caméra", value: "1080p 60fps" },
      { label: "Poids", value: "245 g" },
    ],
  },
  {
    slug: "skyforge-vantage-4k",
    name: "Vantage 4K",
    tagline: "Stabilisation 3 axes, capteur 1 pouce",
    category: "camera",
    price: 62900,
    rating: 4.8,
    reviewCount: 421,
    stock: 34,
    badge: "Best-seller",
    variant: "camera",
    accent: "#38bdf8",
    description:
      "Un capteur 1 pouce, une nacelle stabilisée sur 3 axes et un mode HDR automatique : le Vantage 4K livre des images dignes d'une production professionnelle, même face au vent.",
    highlights: [
      "Capteur 1\" — vidéo 4K/60fps HDR",
      "Nacelle stabilisée 3 axes",
      "Détection et évitement d'obstacles",
      "Suivi sujet intelligent (ActiveTrack)",
    ],
    specs: [
      { label: "Autonomie", value: "34 min" },
      { label: "Portée", value: "12 km" },
      { label: "Caméra", value: "4K/60fps HDR" },
      { label: "Poids", value: "595 g" },
    ],
  },
  {
    slug: "skyforge-vantage-mini",
    name: "Vantage Mini",
    tagline: "249 g, pliable, qualité studio",
    category: "camera",
    price: 45900,
    rating: 4.7,
    reviewCount: 288,
    stock: 51,
    badge: "Nouveau",
    variant: "fold",
    accent: "#38bdf8",
    description:
      "Le format voyage par excellence : pliable dans une poche de sac à dos, le Vantage Mini pèse moins de 249 g tout en filmant en 4K stabilisé.",
    highlights: [
      "Ultra compact — se plie en 15 secondes",
      "4K/30fps avec stabilisation électronique",
      "Reconnaissance de trajectoire QuickShots",
      "Moins de 249 g — pas d'enregistrement requis",
    ],
    specs: [
      { label: "Autonomie", value: "31 min" },
      { label: "Portée", value: "10 km" },
      { label: "Caméra", value: "4K/30fps" },
      { label: "Poids", value: "249 g" },
    ],
  },
  {
    slug: "vantage-cine-pro",
    name: "Vantage Cine Pro",
    tagline: "Double capteur, RAW 6K, pour les créateurs exigeants",
    category: "camera",
    price: 189900,
    rating: 4.9,
    reviewCount: 97,
    stock: 12,
    badge: "Édition pro",
    variant: "hex",
    accent: "#38bdf8",
    description:
      "Conçu pour les productions cinéma et publicité : capteur secondaire téléobjectif, enregistrement RAW 6K et profil colorimétrique LOG natif.",
    highlights: [
      "Capteur principal 6K + téléobjectif 3x",
      "Enregistrement RAW & D-Log natif",
      "Transmission vidéo O3 jusqu'à 15 km",
      "Nacelle renforcée anti-vibrations",
    ],
    specs: [
      { label: "Autonomie", value: "45 min" },
      { label: "Portée", value: "15 km" },
      { label: "Caméra", value: "6K RAW" },
      { label: "Poids", value: "1,3 kg" },
    ],
  },
  {
    slug: "raptor-fpv-3",
    name: "Raptor FPV 3\"",
    tagline: "Freestyle et pilotage acrobatique",
    category: "fpv",
    price: 34900,
    rating: 4.5,
    reviewCount: 143,
    stock: 27,
    variant: "fpv",
    accent: "#f97316",
    description:
      "Châssis carbone 3 pouces, moteurs haute rotation et contrôleur de vol Betaflight préconfiguré : le Raptor FPV 3\" est prêt à voler dès la sortie de la boîte.",
    highlights: [
      "Châssis carbone 3\" — rapport poids/puissance élevé",
      "Betaflight préconfiguré, profils réglables",
      "Caméra numérique HD faible latence",
      "Compatible manettes standard (Crossfire, ELRS)",
    ],
    specs: [
      { label: "Autonomie", value: "6-8 min" },
      { label: "Vitesse max", value: "140 km/h" },
      { label: "Caméra", value: "HD numérique" },
      { label: "Poids", value: "210 g" },
    ],
  },
  {
    slug: "raptor-fpv-5-racing",
    name: "Raptor FPV 5\" Racing",
    tagline: "Le châssis de compétition, prêt pour la piste",
    category: "fpv",
    price: 52900,
    compareAtPrice: 58900,
    rating: 4.7,
    reviewCount: 89,
    stock: 15,
    badge: "Nouveau",
    variant: "fpv",
    accent: "#f97316",
    description:
      "Utilisé par nos pilotes en compétition : moteurs 2400kV, ESC 60A et transmission vidéo numérique 4K pour dominer chaque manche.",
    highlights: [
      "Moteurs 2400kV / ESC 60A 4-en-1",
      "Transmission vidéo numérique 4K",
      "Cadre en fibre de carbone 5 mm",
      "Réglages PID sauvegardés en usine",
    ],
    specs: [
      { label: "Autonomie", value: "5-7 min" },
      { label: "Vitesse max", value: "180 km/h" },
      { label: "Caméra", value: "4K numérique" },
      { label: "Poids", value: "398 g" },
    ],
  },
  {
    slug: "terrafly-agri-hex",
    name: "TerraFly Agri Hex",
    tagline: "Épandage et cartographie agricole de précision",
    category: "pro",
    price: 459900,
    rating: 4.8,
    reviewCount: 41,
    stock: 6,
    badge: "Édition pro",
    variant: "hex",
    accent: "#16a34a",
    description:
      "Réservoir 16 L, buses à débit variable et cartographie NDVI intégrée : le TerraFly Agri Hex couvre jusqu'à 10 hectares par heure pour un épandage optimisé.",
    highlights: [
      "Réservoir 16 L, débit variable automatique",
      "Cartographie NDVI et planification de mission",
      "Châssis hexacopter renforcé IP54",
      "Formation et support technique inclus",
    ],
    specs: [
      { label: "Autonomie", value: "22 min en charge" },
      { label: "Couverture", value: "10 ha/h" },
      { label: "Capacité", value: "16 L" },
      { label: "Poids", value: "22 kg (à vide)" },
    ],
  },
  {
    slug: "terrafly-inspect-x6",
    name: "TerraFly Inspect X6",
    tagline: "Inspection BTP, thermographie et zoom 200x",
    category: "pro",
    price: 329900,
    rating: 4.7,
    reviewCount: 58,
    stock: 9,
    variant: "hex",
    accent: "#16a34a",
    description:
      "Caméra thermique radiométrique et zoom optique 200x pour inspecter toitures, lignes électriques et ouvrages d'art sans mise en danger d'équipe au sol.",
    highlights: [
      "Caméra thermique radiométrique intégrée",
      "Zoom optique 200x pour inspection à distance",
      "Résistance IP55, vol par vent jusqu'à 40 km/h",
      "Export de rapports automatisé",
    ],
    specs: [
      { label: "Autonomie", value: "40 min" },
      { label: "Portée", value: "20 km" },
      { label: "Caméra", value: "Thermique + zoom 200x" },
      { label: "Poids", value: "3,8 kg" },
    ],
  },
  {
    slug: "terrafly-survey-map",
    name: "TerraFly Survey Map",
    tagline: "Photogrammétrie et modélisation 3D de chantier",
    category: "pro",
    price: 279900,
    rating: 4.6,
    reviewCount: 33,
    stock: 11,
    variant: "camera",
    accent: "#16a34a",
    description:
      "RTK centimétrique embarqué et planification de vol automatisée pour produire orthophotos et modèles 3D de chantier en une seule mission.",
    highlights: [
      "Précision RTK centimétrique",
      "Planification de mission automatisée",
      "Export orthophoto et nuage de points",
      "Compatible logiciels SIG standards",
    ],
    specs: [
      { label: "Autonomie", value: "43 min" },
      { label: "Précision", value: "± 1 cm (RTK)" },
      { label: "Caméra", value: "20 MP" },
      { label: "Poids", value: "1,1 kg" },
    ],
  },
];

export function getProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}

export function getRelated(product: Product, max = 3) {
  return products
    .filter((p) => p.slug !== product.slug && p.category === product.category)
    .slice(0, max);
}

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}
