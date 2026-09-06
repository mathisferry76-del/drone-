// Resolves a car make/model name to a real reference photo URL, so
// "Impressionne tes potes" can give FLUX Kontext an actual photo of the
// exact requested model instead of relying purely on the model's memorized
// training data for brand/body-shape fidelity — see the reference-image
// path in app/api/impress/route.ts and lib/fal.ts's editImageWithFluxMulti.
// Prompt-only fidelity kept producing wrong-brand or approximate results
// even after extensive tuning (confirmed in production: an unambiguous
// "Audi RS6 Avant" request came back as a Ferrari) because the model has
// no way to be "shown" what's correct, only told.
//
// CarImagery is a free, keyless public lookup (no account/API key setup)
// that resolves a make/model search string to a real stock photo URL —
// good enough as a best-effort visual anchor. It has real coverage gaps
// (obscure trims, very new models), so every caller treats a null return
// as "no reference available" and falls back to the existing text-only
// prompt path rather than failing the request over it.
export async function findCarReferenceImage(searchTerm: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.carimagery.com/api.asmx/GetImageUrl?searchTerm=${encodeURIComponent(searchTerm)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const xml = await res.text();
    // Response is a bare XML string element, e.g.
    // <string xmlns="http://carimagery.com/">https://.../photo.jpg</string>
    const match = xml.match(/<string[^>]*>([^<]*)<\/string>/i);
    const url = match?.[1]?.trim();
    if (!url || !/^https?:\/\//i.test(url)) return null;
    return url;
  } catch (err) {
    console.error("findCarReferenceImage error", err);
    return null;
  }
}
