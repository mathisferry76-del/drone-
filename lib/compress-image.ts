// A phone photo can easily be 3-10MB straight out of the camera roll
// (modern phones barely compress at capture time). Every one of those
// bytes has to cross the user's actual connection before the server-side
// generation deadline even starts counting — on a weak signal, just
// uploading a full-res source photo plus an optional reference photo can
// burn through the whole request budget before any AI call begins,
// surfacing as a generic "server timed out" error that has nothing to do
// with how slow the AI itself is. Confirmed in production: a user on a
// weak 4G connection with a reference photo attached hit exactly this.
// Downscaling client-side to a size that's still far more detail than any
// of the providers we call need, and re-encoding as JPEG, routinely cuts
// multi-megabyte HEIC/PNG originals down by 80-95% before they ever leave
// the browser — with no server-side change required.
export async function compressImageFile(
  file: File,
  maxDimension = 2048,
  quality = 0.85
): Promise<File> {
  // Skip already-small files: nothing meaningful to gain, and re-encoding
  // a small/already-efficient file can occasionally come out larger.
  if (file.size < 1.5 * 1024 * 1024) return file;

  try {
    // "from-image" bakes any EXIF rotation into the actual pixels — the
    // re-encoded JPEG carries no EXIF, so without this a photo shot in
    // portrait could come out sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // createImageBitmap can fail on formats some browsers won't decode
    // client-side (e.g. certain HEIC variants) — fall back to the
    // original file rather than blocking the upload entirely.
    return file;
  }
}
