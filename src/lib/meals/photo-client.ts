import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE } from "@/config/meals";

/**
 * A phone photo, made small enough to upload.
 *
 * Browser-only. A photo straight off a phone camera is 3–6MB — five times the
 * Server Action body limit — and is 4000 pixels wide to be shown in a card 400
 * wide. So it is drawn onto a canvas at most `PHOTO_MAX_EDGE` on its long
 * side and re-encoded as JPEG, stepping the quality down until it fits under
 * `PHOTO_MAX_BYTES`. The server checks the size again; this is what makes the
 * check pass.
 *
 * `createImageBitmap` with `imageOrientation: "from-image"` is what keeps a
 * portrait photo portrait: the camera stores it sideways with an EXIF note,
 * and a plain `<img>` drawn to a canvas ignores the note on some browsers.
 */
export async function shrinkPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That is not a photo.");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot resize photos.");
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(dataUrl) <= PHOTO_MAX_BYTES) return dataUrl;
    }
    throw new Error("That photo is too detailed to shrink enough. Try another.");
  } finally {
    bitmap.close();
  }
}

/** The decoded size of a base64 data URL, without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
