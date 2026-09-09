import { NextRequest, NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/supabase";
import {
  getVideoEditPrediction,
  describeReplicateVideoError,
} from "@/lib/replicate-video";

export const runtime = "nodejs";

// Throwaway test route, see app/api/admin/test-transition/route.ts.
// getVideoEditPrediction is generic (just predictions.get(id) under the
// hood) — reused as-is rather than duplicated for this one-off poll.
const OWNER_EMAIL = "mathis.ferry76@gmail.com";

export async function GET(req: NextRequest) {
  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser || authUser.email?.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const predictionId = req.nextUrl.searchParams.get("predictionId");
  if (!predictionId) {
    return NextResponse.json({ error: "predictionId manquant." }, { status: 400 });
  }

  try {
    const prediction = await getVideoEditPrediction(predictionId);
    if (prediction.status === "succeeded") {
      const output = prediction.output;
      const url = Array.isArray(output) ? output[0] : output;
      return NextResponse.json({ status: "succeeded", url });
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return NextResponse.json({
        status: prediction.status,
        error: describeReplicateVideoError(new Error(String(prediction.error ?? "Échec.")))
      });
    }
    return NextResponse.json({ status: prediction.status });
  } catch (err) {
    console.error("test-transition status error", err);
    return NextResponse.json({ error: describeReplicateVideoError(err) }, { status: 502 });
  }
}
