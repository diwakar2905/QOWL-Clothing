import { describe, it, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { storeImage, deleteStoredImage } from "@/server/storage";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CLOUDINARY_URL;
  process.env.STORAGE_DRIVER = "local";
});

describe("Cloudinary driver", () => {
  it("uploads the re-encoded WebP with a signed request and deletes it again", async () => {
    process.env.STORAGE_DRIVER = "cloudinary";
    process.env.CLOUDINARY_URL = "cloudinary://key123:secret456@qowl-test";
    const calls: { url: string; form: FormData }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, form: init.body as FormData });
      const id = (init.body as FormData).get("public_id");
      return new Response(JSON.stringify(url.endsWith("/upload") ? { secure_url: `https://res.cloudinary.com/qowl-test/image/upload/v1/${id}.webp` } : { result: "ok" }), { status: 200 });
    });
    const png = await sharp({ create: { width: 400, height: 500, channels: 3, background: "#073d2d" } }).png().toBuffer();
    const img = await storeImage(new File([new Uint8Array(png)], "look.png", { type: "image/png" }), { folder: "products" });

    expect(calls[0]!.url).toBe("https://api.cloudinary.com/v1_1/qowl-test/image/upload");
    const f = calls[0]!.form;
    expect(f.get("api_key")).toBe("key123");
    expect(String(f.get("signature"))).toMatch(/^[0-9a-f]{40}$/);
    expect(f.get("public_id")).toBe(img.storageKey.replace(/\.webp$/, ""));
    expect((f.get("file") as Blob).type).toBe("image/webp");
    expect(img.url).toMatch(/^https:\/\/res\.cloudinary\.com\/qowl-test\/image\/upload\//);
    expect(await db.mediaAsset.count({ where: { storageKey: img.storageKey } })).toBe(1);

    await deleteStoredImage(img.storageKey);
    expect(calls[1]!.url).toBe("https://api.cloudinary.com/v1_1/qowl-test/image/destroy");
    expect(await db.mediaAsset.count({ where: { storageKey: img.storageKey } })).toBe(0);
  });

  it("reports Cloudinary errors clearly", async () => {
    process.env.STORAGE_DRIVER = "cloudinary";
    process.env.CLOUDINARY_URL = "cloudinary://key123:wrong@qowl-test";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "Invalid Signature" } }), { status: 401 }));
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(storeImage(new File([new Uint8Array(png)], "x.png"), { folder: "cms" })).rejects.toThrow(/Invalid Signature/);
  });
});
