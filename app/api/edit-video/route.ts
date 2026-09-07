import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffprobePath from "@ffprobe-installer/ffprobe";
import { getReplicateKey } from "@/lib/replicate";
import { startVideoEdit, describeReplicateVideoEditError } from "@/lib/replicate-video-edit";
import { normalizeVideoForAleph } from "@/lib/video-compress";
import { VIDEO_EDIT_CREDIT_COST } from "@/lib/presets";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Only starts the job and returns Replicate's prediction id — see
// lib/replicate-video-edit.ts's file-level comment for why this route
// deliberately doesn't wait for the edit itself to finish (that's
// app/api/edit-video/status/route.ts's job, polled by the client). This
// request should only ever take as long as reading the upload, probing its
// duration, compressing it if it's oversized, and one fast Replicate API
// call.
export const maxDuration = 90;

// Runway Aleph 2.0's own hard cap on input file size.
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;
const MAX_DESCRIPTION = 1200;
// Aleph 2.0 itself accepts 2-30s inputs, but VIDEO_EDIT_CREDIT_COST is a
// flat price calibrated for a short clip (see lib/presets.ts) — real API
// cost scales with duration, so a much longer clip would be sold under
// cost. Capped tight rather than accepting the full 30s range Aleph allows.
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 4;
// Generous relative to how long Aleph 2.0 actually takes to fetch and
// start processing the video — this is how long the signed URL we hand it
// has to remain valid, not how long the whole job can run.
const ALEPH_FETCH_URL_TTL_SECONDS = 60 * 60;

const execFileAsync = promisify(execFile);

// The user's raw description used to go to Aleph completely unwrapped —
// unlike buildImpressPrompt (app/api/impress/route.ts) and buildAnimatePrompt
// (app/api/animate/route.ts), no brand/model fidelity guidance at all. A
// live test replacing a car with a named Ferrari model came back a
// generically-shaped supercar (mid-engine short-hood proportions instead of
// the named model's actual front-engine long-hood layout) with a blurry
// smudge instead of the prancing-horse logo — the exact class of failure
// buildImpressPrompt's own fidelity rules were built to catch, just never
// ported to this feature. This wrapper borrows the parts of that proven
// approach that still apply to editing a real filmed clip (body style/
// proportions, logo precision or omission, real material texture) without
// the physical-lighting-integration rules that only make sense for
// compositing a new photo, not editing existing footage.
function buildEditVideoPrompt(userDescription: string): string {
  return `Tu édites une vraie vidéo filmée, image par image, pas une scène générée de zéro. Garde absolument identiques le décor, l'éclairage, le mouvement de caméra déjà filmé et tout élément non concerné par le changement demandé (y compris une main ou une personne visible à l'écran) — seul l'objet désigné par la description ci-dessous doit changer.

Fidélité de marque/modèle si la description nomme une marque et un modèle précis (voiture, montre, sac...) — ne généralise JAMAIS vers un modèle générique de la catégorie :
- Respecte exactement la silhouette et la catégorie de carrosserie du modèle réel. Pour une voiture : un modèle à moteur avant (ex : Ferrari 812 Superfast, une GT V12) a un capot long et un habitacle reculé vers l'arrière — jamais le capot court et l'habitacle avancé typique d'un modèle à moteur central (ex : Ferrari 296, F8) même si la marque demandée est correcte. Ne confonds jamais ces deux catégories.
- Le logo/emblème de la marque doit être net et fidèle au vrai design (ex : le cheval cabré net sur écusson jaune de Ferrari, pas une tache de couleur floue). Si tu ne peux pas le rendre net et reconnaissable à cette taille, ne l'affiche pas du tout plutôt que d'afficher une forme approximative ou un texte de marque mal orthographié.
- Matière et texture réalistes : peinture avec de vrais reflets qui bougent de façon cohérente avec le mouvement de caméra déjà filmé, jamais un aspect plat ou "rendu 3D".

Changement demandé : ${userDescription}`;
}

async function getVideoDurationSeconds(video: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "edit-video-probe-"));
  const inputPath = join(dir, "input.mp4");
  try {
    await writeFile(inputPath, video);
    const { stdout } = await execFileAsync(ffprobePath.path, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      inputPath,
    ]);
    const duration = Number(stdout.trim());
    if (!duration || Number.isNaN(duration)) {
      throw new Error(`ffprobe n'a pas pu lire la durée de la vidéo (${stdout.trim()}).`);
    }
    return duration;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function POST(req: NextRequest) {
  if (isRateLimited(`edit-video:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
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
        p_cost: VIDEO_EDIT_CREDIT_COST,
      });
    } catch (err) {
      console.error("release_credits_reservation error", err);
    }
  }

  // The path to the video the client already uploaded straight to Supabase
  // Storage (see app/api/edit-video/upload-url/route.ts) — cleaned up here
  // once it's been downloaded server-side, regardless of outcome.
  let uploadPath: string | null = null;
  async function cleanupUpload() {
    if (!uploadPath) return;
    try {
      await admin!.storage.from("videos").remove([uploadPath]);
    } catch (err) {
      console.error("edit-video upload cleanup error", err);
    }
  }

  try {
    const body = (await req.json()) as { path?: string; description?: string };
    const path = body.path;
    const description = String(body.description ?? "").trim().slice(0, MAX_DESCRIPTION);

    if (!path) {
      return NextResponse.json({ error: "Aucune vidéo reçue." }, { status: 400 });
    }
    // Defense in depth: only ever download a path this same route's own
    // upload-url endpoint could have handed out for this user, never an
    // arbitrary caller-supplied storage path.
    if (!path.startsWith(`uploads/${authUser.id}/`)) {
      return NextResponse.json({ error: "Vidéo invalide." }, { status: 400 });
    }
    uploadPath = path;
    if (!description) {
      return NextResponse.json(
        { error: "Décris le changement que tu veux voir sur ta vidéo." },
        { status: 400 }
      );
    }

    if (!getReplicateKey()) {
      return NextResponse.json(
        { error: "Aucun fournisseur de transformation vidéo configuré (REPLICATE_API_TOKEN manquante)." },
        { status: 500 }
      );
    }

    // Downloaded server-to-server via the Supabase Storage SDK, not
    // received as this request's own body — Vercel's 4.5MB inbound request
    // body cap (platform-level, not something maxDuration/config can
    // change) doesn't apply to a download our own server initiates, which
    // is exactly why the video is uploaded to Storage directly by the
    // browser instead of sent through this route.
    const { data: downloaded, error: downloadError } = await admin.storage
      .from("videos")
      .download(path);
    if (downloadError || !downloaded) {
      console.error("edit-video download error", downloadError);
      return NextResponse.json(
        { error: "Impossible de récupérer la vidéo envoyée. Réessaie." },
        { status: 400 }
      );
    }
    const rawVideoBuffer = Buffer.from(await downloaded.arrayBuffer());

    // Every upload is normalized before being sent to Aleph — see
    // lib/video-compress.ts's file-level comment for why: it both handles
    // a phone shooting 4K/60fps or ProRes well over Aleph's 16MB input cap,
    // and strips the leftover rotation metadata that made a live test's
    // video fail inside Aleph itself ("Failed to parse video resolution:
    // too many values to unpack").
    let videoBuffer: Buffer;
    try {
      videoBuffer = await normalizeVideoForAleph(rawVideoBuffer);
    } catch (err) {
      console.error("edit-video compress error", err);
      await cleanupUpload();
      return NextResponse.json(
        { error: "Cette vidéo n'a pas pu être traitée par le serveur. Essaie une autre vidéo." },
        { status: 400 }
      );
    }
    if (videoBuffer.byteLength > MAX_UPLOAD_BYTES) {
      await cleanupUpload();
      return NextResponse.json(
        { error: "Vidéo trop lourde même après compression (16 Mo max). Essaie une vidéo plus courte." },
        { status: 400 }
      );
    }

    let duration: number;
    try {
      duration = await getVideoDurationSeconds(videoBuffer);
    } catch {
      await cleanupUpload();
      return NextResponse.json(
        { error: "Cette vidéo n'a pas pu être lue par le serveur. Essaie de la réexporter en MP4." },
        { status: 400 }
      );
    }
    if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
      await cleanupUpload();
      return NextResponse.json(
        {
          error: `La vidéo doit durer entre ${MIN_DURATION_SECONDS} et ${MAX_DURATION_SECONDS} secondes (${duration.toFixed(
            1
          )}s reçues). Recadre ta vidéo et réessaie.`,
        },
        { status: 400 }
      );
    }

    // Re-uploaded (overwriting the same path) with an explicit
    // Content-Type we control, then handed to Aleph as a URL rather than
    // a raw Buffer/File — a first attempt let Replicate auto-upload the
    // File to its own storage, which still served it back as
    // "application/octet-stream" regardless of the type set on upload
    // (Aleph's own asset validation rejects that; see
    // lib/replicate-video-edit.ts's file-level comment). Supabase Storage
    // reliably serves back whatever Content-Type we set here, so routing
    // through our own storage instead of Replicate's sidesteps that
    // entirely. Deliberately NOT cleaned up immediately after starting the
    // job below — Aleph fetches this URL sometime during its own
    // processing, not synchronously during predictions.create() — so it
    // has to stay alive until app/api/edit-video/status/route.ts sees a
    // terminal status and cleans it up then.
    const { error: reuploadError } = await admin.storage
      .from("videos")
      .upload(path, videoBuffer, { contentType: "video/mp4", upsert: true });
    if (reuploadError) {
      console.error("edit-video reupload error", reuploadError);
      await cleanupUpload();
      return NextResponse.json(
        { error: "Impossible de préparer la vidéo pour la transformation. Réessaie." },
        { status: 500 }
      );
    }
    const { data: signedForAleph, error: signError } = await admin.storage
      .from("videos")
      .createSignedUrl(path, ALEPH_FETCH_URL_TTL_SECONDS);
    if (signError || !signedForAleph) {
      console.error("edit-video sign error", signError);
      await cleanupUpload();
      return NextResponse.json(
        { error: "Impossible de préparer la vidéo pour la transformation. Réessaie." },
        { status: 500 }
      );
    }

    // Real credit reservation, no owner bypass — same deliberate choice as
    // /api/animate: this feature's real paid flow gets validated for every
    // account, owner included.
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_credits", {
      p_user_id: authUser.id,
      p_cost: VIDEO_EDIT_CREDIT_COST,
    });

    if (reserveError) {
      console.error("reserve_credits error", reserveError);
      await cleanupUpload();
      return NextResponse.json(
        { error: "Erreur pendant la vérification des crédits." },
        { status: 500 }
      );
    }

    reservation = reserved as string;
    if (reservation === "insufficient_credits") {
      await cleanupUpload();
      return NextResponse.json(
        {
          error: `Crédits insuffisants (il faut ${VIDEO_EDIT_CREDIT_COST} crédits pour transformer une vidéo). Achète un pack sur /pricing pour continuer.`,
        },
        { status: 403 }
      );
    }

    try {
      const { id } = await startVideoEdit(signedForAleph.signedUrl, buildEditVideoPrompt(description));
      // NOT cleaned up here — Aleph fetches the video sometime during its
      // own processing, not synchronously during this call, so the file
      // has to stay in Storage until app/api/edit-video/status/route.ts
      // sees a terminal status and cleans it up then. `reservation` and
      // `path` both have to round-trip through the client (not stored
      // server-side) since this route and the polling route are separate,
      // stateless serverless invocations with nothing else linking them
      // beyond what the client passes back.
      return NextResponse.json({ predictionId: id, reservation, path });
    } catch (err) {
      await releaseReservationIfNeeded();
      await cleanupUpload();
      console.error("edit-video start error", err);
      return NextResponse.json({ error: describeReplicateVideoEditError(err) }, { status: 502 });
    }
  } catch (err) {
    await releaseReservationIfNeeded();
    await cleanupUpload();
    console.error("edit-video error", err);
    return NextResponse.json({ error: describeReplicateVideoEditError(err) }, { status: 502 });
  }
}
