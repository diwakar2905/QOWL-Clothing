import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

// Used to equalise timing when the account does not exist.
let dummy: string | undefined;
export async function dummyVerify(password: string) {
  dummy ??= await hashPassword("qowl-timing-equaliser-password");
  await verifyPassword(dummy, password);
}
