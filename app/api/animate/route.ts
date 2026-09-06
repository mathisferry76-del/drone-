import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { animateImageToVideo, describeFalVideoError } from "@/lib/fal-video";
import { getUserFromAuthHeader } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Veo 3.1 generation is a single, non-parallel call (no CANDIDATE_COUNT
// judging like /api/impress — at ~1.60$ for one 4s clip, generating
// several attempts to pick the best isn't affordable) but video synthesis
// itself commonly takes well over a minute. Requested high; actual ceiling
// still depends on the plan (see the identical caveat on /api/impress).
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_DESCRIPTION = 400;

// Test-stage gate: Veo 3.1 costs roughly 6x a single image generation
// (~1.60$ for one 4s/1080p/audio clip vs ~0.25$ for an image), and no
// pricing/credit cost for it has been decided yet — shipping this open to
// every account before that decision is made would be a real, unbounded
// cost exposure. Restricted to the owner's own account so the feature can
// be validated end-to-end before deciding how (or whether) to price it and
// open it up more broadly.
const OWNER_EMAIL = "mathis.ferry76@gmail.com";

export async function POST(req: NextRequest) {
  if (isRateLimited(`animate:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  if (authUser.email?.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json(
      { error: "Fonctionnalité en test, pas encore ouverte à tous les comptes." },
      { status: 403 }
    );
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
        { error: "Décris le mouvement/l'animation que tu veux voir." },
        { status: 400 }
      );
    }

    let normalizedInput: Buffer;
    try {
      normalizedInput = await sharp(Buffer.from(await file.arrayBuffer())).rotate().png().toBuffer();
    } catch {
      return NextResponse.json(
        { error: "Cette photo n'a pas pu être lue par le serveur. Essaie de la réexporter en JPEG ou PNG." },
        { status: 400 }
      );
    }

    const videoUrl = await animateImageToVideo(normalizedInput, description, req.signal);
    return NextResponse.json({ video: videoUrl });
  } catch (err) {
    if (req.signal.aborted) {
      return NextResponse.json({ error: "Génération annulée." }, { status: 499 });
    }
    console.error("animate error", err);
    return NextResponse.json({ error: describeFalVideoError(err) }, { status: 502 });
  }
}
