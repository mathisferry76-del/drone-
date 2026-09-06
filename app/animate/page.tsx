import { redirect } from "next/navigation";

// This standalone prototype page has been superseded by the Image/Vidéo
// toggle built into /impress (credit cost shown up front, shares the photo
// with image mode, results persisted to /historique) — a redirect keeps any
// existing bookmark/link to /animate working instead of landing on a stale,
// feature-poor duplicate of the same tool.
export default function AnimatePage() {
  redirect("/impress?mode=video");
}
