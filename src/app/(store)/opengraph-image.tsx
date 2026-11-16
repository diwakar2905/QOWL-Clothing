import { brandCard, OG_SIZE, OG_TYPE } from "@/server/og";

export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = "QOWL — independent Indian streetwear. Wear Your Own Code.";

export default function Image() {
  return brandCard({ kicker: "Independent Indian streetwear", title: "Wear Your Own Code", line: "Oversized T-shirts and hoodies with original artwork. Drop 001 — The Unwritten." });
}
