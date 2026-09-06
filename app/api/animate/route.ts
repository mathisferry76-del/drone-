import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { animateImageToVideo, describeFalVideoError } from "@/lib/fal-video";
import { VIDEO_CREDIT_COST } from "@/lib/presets";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
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

// Test-stage gate: pricing is now set (VIDEO_CREDIT_COST, lib/presets.ts)
// and wired into the same reserve_credits/release_credits_reservation flow
// as /api/impress, so the financial exposure that justified this gate is
// gone. Still restricted to the owner's own account so the full flow — a
// real generation, a real credit debit — can be validated end-to-end in
// production before opening it up more broadly.
const OWNER_EMAIL = "mathis.ferry76@gmail.com";

export async function POST(req: NextRequest) {
  if (isRateLimited(`animate:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
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
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  if (authUser.email?.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json(
      { error: "Fonctionnalité en test, pas encore ouverte à tous les comptes." },
      { status: 403 }
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

  let reservation: string | null = null;
  async function releaseReservationIfNeeded() {
    if (!reservation) return;
    if (reservation !== "ok_trial" && reservation !== "ok_credits") return;
    try {
      await admin!.rpc("release_credits_reservation", {
        p_user_id: authUser!.id,
        p_reservation: reservation,
        p_cost: VIDEO_CREDIT_COST,
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
        { error: "Décris le mouvement/l'animation que tu veux voir." },
        { status: 400 }
      );
    }

    // Real credit reservation, deliberately without the `p_force_paid`
    // bypass /api/impress grants its owner account (which returns
    // 'ok_owner' and never touches the balance) — the whole point of
    // keeping this feature owner-gated for now is to validate the complete
    // flow, credit debit included, before opening it to every account.
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_credits", {
      p_user_id: authUser.id,
      p_cost: VIDEO_CREDIT_COST,
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
          error: `Crédits insuffisants (il faut ${VIDEO_CREDIT_COST} crédits pour une vidéo). Achète un pack sur /pricing pour continuer.`,
        },
        { status: 403 }
      );
    }

    let normalizedInput: Buffer;
    try {
      normalizedInput = await sharp(Buffer.from(await file.arrayBuffer())).rotate().png().toBuffer();
    } catch {
      await releaseReservationIfNeeded();
      return NextResponse.json(
        { error: "Cette photo n'a pas pu être lue par le serveur. Essaie de la réexporter en JPEG ou PNG." },
        { status: 400 }
      );
    }

    const videoUrl = await animateImageToVideo(normalizedInput, description, req.signal);
    return NextResponse.json({ video: videoUrl });
  } catch (err) {
    await releaseReservationIfNeeded();
    if (req.signal.aborted) {
      return NextResponse.json({ error: "Génération annulée." }, { status: 499 });
    }
    console.error("animate error", err);
    return NextResponse.json({ error: describeFalVideoError(err) }, { status: 502 });
  }
}
