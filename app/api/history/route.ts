import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromAuthHeader } from "@/lib/supabase";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h, plenty for viewing/downloading in one sitting

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "L'historique n'est pas configuré sur ce déploiement." },
      { status: 501 }
    );
  }

  const user = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { data: rows, error } = await admin
    .from("generations")
    .select("id, storage_path, preset_id, used_ai, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("history list error", error);
    return NextResponse.json({ error: "Erreur pendant la lecture de l'historique." }, { status: 500 });
  }

  const items = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: signed } = await admin.storage
        .from("thumbnails")
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      return {
        id: row.id,
        presetId: row.preset_id,
        usedAi: row.used_ai,
        createdAt: row.created_at,
        url: signed?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ items });
}

export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "L'historique n'est pas configuré sur ce déploiement." },
      { status: 501 }
    );
  }

  const user = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id manquant." }, { status: 400 });
  }

  const { data: row } = await admin
    .from("generations")
    .select("id, storage_path, user_id")
    .eq("id", id)
    .single();

  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  await admin.storage.from("thumbnails").remove([row.storage_path]);
  await admin.from("generations").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
