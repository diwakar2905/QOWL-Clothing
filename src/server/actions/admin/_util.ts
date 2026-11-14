import "server-only";
import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const opt = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : v;
};
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
export const intOrNull = (f: FormData, k: string) => {
  const v = str(f, k);
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new z.ZodError([{ code: "custom", path: [k], message: "Enter a whole number", input: v }]);
  return n;
};
/** Admin enters rupees (e.g. 1299 or 1,299.50); stored as paise. */
export const paise = (f: FormData, k: string, required = true) => {
  const v = str(f, k);
  if (v === "") {
    if (required) throw new z.ZodError([{ code: "custom", path: [k], message: "Required", input: v }]);
    return null;
  }
  try {
    const p = rupeesToPaise(v);
    if (p < 0) throw new Error();
    return p;
  } catch {
    throw new z.ZodError([{ code: "custom", path: [k], message: "Enter an amount in rupees", input: v }]);
  }
};
/** datetime-local input (interpreted as IST) → Date. */
export const istDate = (f: FormData, k: string) => {
  const v = str(f, k);
  if (!v) return null;
  const d = new Date(`${v}${v.length === 16 ? ":00" : ""}+05:30`);
  if (Number.isNaN(d.getTime())) throw new z.ZodError([{ code: "custom", path: [k], message: "Invalid date", input: v }]);
  return d;
};
export const list = (f: FormData, k: string) => str(f, k).split(",").map((s) => s.trim()).filter(Boolean);
