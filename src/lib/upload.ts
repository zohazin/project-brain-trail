import { supabase } from "@/integrations/supabase/client";

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_INPUT = 15 * 1024 * 1024;
const MAX_SIDE = 1600;

/** Checks a chosen file before anything is uploaded. Returns a short message, or null when it is fine. */
export function photoProblem(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith("image/")) return "Please choose a photo (JPG, PNG or WebP).";
  if (!OK_TYPES.includes(file.type)) return "This photo type isn't supported. Please choose a JPG, PNG or WebP photo.";
  if (file.size > MAX_INPUT) return "The photo is too big. Please choose one under 15 MB.";
  return null;
}

/**
 * Redraws every photo as a fresh JPEG (max 1600 px). Redrawing keeps only the pixels, so hidden
 * details such as the GPS location of a home are never uploaded. A photo the browser can't read is refused.
 */
async function shrink(file: File): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    throw new Error("This browser can't prepare photos. Please try another browser.");
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo can't be read here. Please choose a JPG, PNG or WebP photo.");
  }
  const ratio = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * ratio));
  canvas.height = Math.max(1, Math.round(bmp.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos. Please try another browser.");
  ctx.fillStyle = "#ffffff"; // transparent PNGs get a plain background in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new Error("Could not prepare the photo. Please try again.");
  return blob;
}

/** Uploads a photo into the person's own private folder and returns its path. */
export async function uploadPhoto(userId: string, file: File, folder: string): Promise<string> {
  const problem = photoProblem(file);
  if (problem) throw new Error(problem);
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("You're offline. Connect to the internet to add photos.");
  const body = await shrink(file);
  const path = `${userId}/${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("photos").upload(path, body, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error("Could not upload the photo. Please try again.");
  return path;
}

/** Signed link for a photo in the person's own folder. */
export async function ownPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Signed links for several of my own photos at once. */
export async function ownPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from("photos").createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}
