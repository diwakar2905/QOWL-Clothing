import { removeItem, updateQuantity } from "@/server/services/cart";
import { handle, json, readJson } from "@/server/api";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = (await readJson(req)) as { quantity: number };
  await updateQuantity(id, Number(body.quantity));
  return json({ updated: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await removeItem(id);
  return json({ removed: true });
});
