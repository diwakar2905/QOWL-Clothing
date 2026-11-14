import { addItem } from "@/server/services/cart";
import { handle, json, readJson } from "@/server/api";

export const POST = handle(async (req: Request) => {
  await addItem((await readJson(req)) as { variantId: string; quantity: number });
  return json({ added: true }, { status: 201 });
});
