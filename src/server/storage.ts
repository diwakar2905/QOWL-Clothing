import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { AppError } from "@/lib/errors";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["jpeg", "png", "webp", "avif", "heif"]);

export type StoredImage = { url: string; storageKey: string; width: number; height: number; bytes: number; mimeType: string };

interface Driver {
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  remove(key: string): Promise<void>;
}

class LocalDriver implements Driver {
  constructor(private dir: string) {}
  async put(key: string, body: Buffer) {
    const file = path.join(/* turbopackIgnore: true */ this.dir, key);
    await mkdir(/* turbopackIgnore: true */ path.dirname(file), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ file, body);
    return `/media/${key}`;
  }
  async remove(key: string) {
    await unlink(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ this.dir, key)).catch(() => {});
  }
}

class S3Driver implements Driver {
  private client: S3Client;
  constructor(private bucket: string, private publicBase: string) {
    this.client = new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    return `${this.publicBase.replace(/\/$/, "")}/${key}`;
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** Parses CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>). */
export function cloudinaryConfig(raw = process.env.CLOUDINARY_URL) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "cloudinary:" || !u.username || !u.password || !u.hostname) return null;
    return { apiKey: decodeURIComponent(u.username), apiSecret: decodeURIComponent(u.password), cloudName: u.hostname };
  } catch {
    return null;
  }
}

/** Cloudinary request signature: SHA-1 of the sorted params plus the API secret. */
export function cloudinarySignature(params: Record<string, string | number>, apiSecret: string) {
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

class CloudinaryDriver implements Driver {
  private cfg = cloudinaryConfig()!;
  private async call(action: "upload" | "destroy", params: Record<string, string | number>, file?: Buffer) {
    const signed = { ...params, timestamp: Math.floor(Date.now() / 1000) };
    const form = new FormData();
    for (const [k, v] of Object.entries(signed)) form.set(k, String(v));
    form.set("api_key", this.cfg.apiKey);
    form.set("signature", cloudinarySignature(signed, this.cfg.apiSecret));
    if (file) form.set("file", new Blob([new Uint8Array(file)], { type: "image/webp" }), "image.webp");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cfg.cloudName}/image/${action}`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
    const json = (await res.json().catch(() => ({}))) as { secure_url?: string; result?: string; error?: { message?: string } };
    if (!res.ok) throw new AppError("UPLOAD_FAILED", `Image storage error: ${json.error?.message ?? res.status}`, 502);
    return json;
  }
  async put(key: string, body: Buffer) {
    // Already validated, resized and re-encoded to WebP by storeImage().
    const json = await this.call("upload", { public_id: key.replace(/\.webp$/, ""), overwrite: "false" }, body);
    if (!json.secure_url) throw new AppError("UPLOAD_FAILED", "Image storage didn't return a URL.", 502);
    return json.secure_url;
  }
  async remove(key: string) {
    await this.call("destroy", { public_id: key.replace(/\.webp$/, ""), invalidate: "true" });
  }
}

/**
 * Folder for the local storage driver (development / single persistent host).
 * The path comes from the environment at runtime, so tell Turbopack not to
 * trace it; otherwise the whole project gets bundled into the server output.
 */
function localRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_STORAGE_DIR ?? "./storage/uploads");
}

function driver(): Driver {
  if (process.env.STORAGE_DRIVER === "cloudinary") return new CloudinaryDriver();
  if (process.env.STORAGE_DRIVER === "s3") return new S3Driver(process.env.S3_BUCKET!, process.env.MEDIA_PUBLIC_BASE_URL!);
  return new LocalDriver(localRoot());
}

/**
 * Validate and re-encode an uploaded image. Decoding with sharp rejects
 * non-images and polyglots; re-encoding strips EXIF/GPS metadata.
 */
export async function storeImage(file: File, opts: { folder: "products" | "cms" | "collections" | "reviews" | "returns"; uploadedBy?: string; alt?: string; maxWidth?: number }): Promise<StoredImage> {
  if (!(file instanceof File) || file.size === 0) throw new AppError("NO_FILE", "Choose an image to upload.");
  if (file.size > MAX_BYTES) throw new AppError("FILE_TOO_LARGE", "Images must be 12 MB or smaller.");
  const input = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" }).metadata();
  } catch {
    throw new AppError("INVALID_IMAGE", "This file isn't a supported image.");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new AppError("INVALID_IMAGE", "Upload a JPEG, PNG, WebP or AVIF image.");
  if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) throw new AppError("IMAGE_TOO_SMALL", "Images must be at least 200×200 pixels.");
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" })
    .rotate()
    .resize({ width: opts.maxWidth ?? 2400, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });
  const key = `${opts.folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.webp`;
  const url = await driver().put(key, data, "image/webp");
  await db.mediaAsset.create({ data: { storageKey: key, url, mimeType: "image/webp", width: info.width, height: info.height, bytes: data.length, alt: opts.alt, uploadedBy: opts.uploadedBy } });
  return { url, storageKey: key, width: info.width, height: info.height, bytes: data.length, mimeType: "image/webp" };
}

export async function deleteStoredImage(storageKey: string | null | undefined) {
  if (!storageKey) return;
  await driver().remove(storageKey);
  await db.mediaAsset.deleteMany({ where: { storageKey } });
}

/** Local driver read (served by /media/[...key]); rejects path traversal. */
export async function readLocal(key: string): Promise<Buffer | null> {
  if (!/^[a-z]+\/\d{4}-\d{2}\/[A-Za-z0-9_-]+\.webp$/.test(key)) return null;
  const base = localRoot();
  const file = path.resolve(/* turbopackIgnore: true */ base, key);
  if (!file.startsWith(base + path.sep)) return null;
  return readFile(/* turbopackIgnore: true */ file).catch(() => null);
}
