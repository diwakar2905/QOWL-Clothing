import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

type StoreImageOpts = {
  folder?: string;
  uploadedBy?: string;
  maxWidth?: number;
};

type StoredImage = {
  storageKey: string;
  url: string;
  width: number;
  height: number;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const DEFAULT_MAX_WIDTH = 2200;
const folderRe = /^[a-z0-9][a-z0-9-_]{0,63}$/i;
const keyRe = /^[a-zA-Z0-9._/-]+$/;

let s3Client: S3Client | undefined;

function localRoot() {
  return path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR);
}

function sanitizeFolder(folder?: string) {
  const value = (folder ?? "misc").trim();
  if (!folderRe.test(value)) throw new AppError("VALIDATION", "Invalid upload folder.");
  return value;
}

function assertSafeKey(key: string) {
  if (!key || !keyRe.test(key) || key.includes("..") || key.startsWith("/")) return false;
  return key.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function publicUrl(key: string) {
  if (env.STORAGE_DRIVER === "local") return `/media/${key}`;
  const base = env.MEDIA_PUBLIC_BASE_URL!.replace(/\/+$/, "");
  return `${base}/${key}`;
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: Boolean(env.S3_ENDPOINT),
    });
  }
  return s3Client;
}

async function encodeImage(file: File, maxWidth: number) {
  if (!file.type.startsWith("image/")) throw new AppError("VALIDATION", "Please upload an image file.");
  if (file.size <= 0) throw new AppError("VALIDATION", "Uploaded file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("TOO_LARGE", "Image is too large (max 10MB).", 413);

  const input = Buffer.from(await file.arrayBuffer());
  const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) throw new AppError("VALIDATION", "Invalid image data.");

  const out = await pipeline
    .resize({ width: Math.max(1, Math.min(maxWidth || DEFAULT_MAX_WIDTH, meta.width)), withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return {
    data: out.data,
    width: out.info.width,
    height: out.info.height,
  };
}

export async function storeImage(file: File, opts: StoreImageOpts = {}): Promise<StoredImage> {
  const folder = sanitizeFolder(opts.folder);
  const maxWidth = Number.isFinite(opts.maxWidth) && opts.maxWidth! > 0 ? Math.floor(opts.maxWidth!) : DEFAULT_MAX_WIDTH;
  const encoded = await encodeImage(file, maxWidth);
  const storageKey = `${folder}/${new Date().toISOString().slice(0, 10).replaceAll("-", "/")}/${randomUUID()}.webp`;

  if (env.STORAGE_DRIVER === "local") {
    const absolute = path.resolve(localRoot(), storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, encoded.data);
  } else {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: storageKey,
        Body: encoded.data,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  return {
    storageKey,
    url: publicUrl(storageKey),
    width: encoded.width,
    height: encoded.height,
  };
}

export async function deleteStoredImage(storageKey: string | null | undefined) {
  if (!storageKey || !assertSafeKey(storageKey)) return;
  if (env.STORAGE_DRIVER === "local") {
    const root = localRoot();
    const target = path.resolve(root, storageKey);
    if (!target.startsWith(`${root}${path.sep}`)) return;
    await rm(target, { force: true });
    return;
  }
  await getS3Client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }));
}

export async function readLocal(storageKey: string): Promise<Buffer | null> {
  if (env.STORAGE_DRIVER !== "local" || !assertSafeKey(storageKey)) return null;
  const root = localRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) return null;
  try {
    return await readFile(target);
  } catch {
    return null;
  }
}
