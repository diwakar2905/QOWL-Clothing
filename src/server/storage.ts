import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
    const file = path.join(this.dir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return `/media/${key}`;
  }
  async remove(key: string) {
    await unlink(path.join(this.dir, key)).catch(() => {});
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

function driver(): Driver {
  if (process.env.STORAGE_DRIVER === "s3") return new S3Driver(process.env.S3_BUCKET!, process.env.MEDIA_PUBLIC_BASE_URL!);
  return new LocalDriver(path.resolve(process.env.LOCAL_STORAGE_DIR ?? "./storage/uploads"));
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
  const base = path.resolve(process.env.LOCAL_STORAGE_DIR ?? "./storage/uploads");
  const file = path.resolve(base, key);
  if (!file.startsWith(base + path.sep)) return null;
  return readFile(file).catch(() => null);
}
