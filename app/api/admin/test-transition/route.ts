import { NextRequest, NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/supabase";
import { startFirstLastFrameVideo, describeReplicateVideoError } from "@/lib/replicate-video";

export const runtime = "nodejs";

// Throwaway, owner-only test route: is Seedance 2.5's first/last-frame mode
// (see lib/replicate-video.ts) any good at a smooth car-to-car transition,
// using two of this site's own already-public "Impressionne tes potes"
// example photos (same background/angle, only the car itself changes) as
// the start/end keyframes? Not a real feature yet — just answering that one
// question before deciding whether to build a hero animation around it.
// Delete this route (and app/admin/test-transition/page.tsx) once decided.
const OWNER_EMAIL = "mathis.ferry76@gmail.com";

export async function POST(req: NextRequest) {
  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser || authUser.email?.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const imageUrl = `${origin}/examples/impress/peugeot-ferrari-4-avant.webp`;
  const lastImageUrl = `${origin}/examples/impress/peugeot-ferrari-4-apres.webp`;

  // Deliberately explicit about NOT wanting text/watermarks/logos and about
  // keeping the transition purely a car-to-car dissolve in the same static
  // scene — exactly what was asked for, spelled out for the model instead
  // of left implicit.
  const prompt =
    "Cinematic, ultra-realistic car commercial. The camera stays perfectly static. " +
    "The first car smoothly and seamlessly transforms into the second car, in the exact same parking spot, " +
    "same lighting, same background, same shadows — a premium, elegant morph/dissolve effect, like a luxury " +
    "car reveal advertisement. No text, no logos, no watermark, no captions, no extra objects appearing. " +
    "Nothing else in the scene moves or changes.";

  try {
    const predictionId = await startFirstLastFrameVideo(imageUrl, lastImageUrl, prompt);
    return NextResponse.json({ predictionId });
  } catch (err) {
    console.error("test-transition start error", err);
    return NextResponse.json({ error: describeReplicateVideoError(err) }, { status: 502 });
  }
}
