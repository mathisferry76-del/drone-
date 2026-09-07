"use client";

// A plain <a href={url} download> only forces a real download for a
// same-origin URL (or a data: URI) — for a cross-origin URL like a
// Supabase Storage signed URL (a different domain from the site), browsers
// ignore the `download` attribute entirely and just navigate to it,
// leaving the user with an opened file instead of a saved one. Fetching
// the bytes into a blob first sidesteps that: a blob: URL has no origin of
// its own, so `download` is always honored.
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}).`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
