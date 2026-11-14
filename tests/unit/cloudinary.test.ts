import { describe, it, expect } from "vitest";
import { cloudinaryConfig, cloudinarySignature } from "@/server/storage";

describe("Cloudinary storage", () => {
  it("signs params like Cloudinary's documented example", () => {
    // https://cloudinary.com/documentation/authentication_signatures
    const sig = cloudinarySignature({ eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 }, "abcd");
    expect(sig).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });
  it("parses CLOUDINARY_URL and rejects malformed values", () => {
    expect(cloudinaryConfig("cloudinary://123456:s3cr%2Bet@qowl")).toEqual({ apiKey: "123456", apiSecret: "s3cr+et", cloudName: "qowl" });
    expect(cloudinaryConfig("https://123:abc@qowl")).toBeNull();
    expect(cloudinaryConfig("cloudinary://qowl")).toBeNull();
    expect(cloudinaryConfig(undefined)).toBeNull();
  });
});
