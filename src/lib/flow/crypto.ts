import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Organization AI keys are encrypted with AES-256-GCM. The encryption key is
// derived from APP_SECRET with HKDF, salted with the organization's id, so a
// ciphertext copied into another workspace (or another installation) can't
// be decrypted. Keys are decrypted only on the server, right before a call
// to the provider, and are never sent to the browser.

const VERSION = "v1";

export class FlowSecretMissing extends Error {
  constructor() {
    super("APP_SECRET is missing or too short");
  }
}

function appSecret(): string {
  const secret = process.env.APP_SECRET ?? "";
  if (secret.length < 32) throw new FlowSecretMissing();
  return secret;
}

function derive(orgId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", appSecret(), `tamam:org:${orgId}`, "tamam:flow-key:v1", 32));
}

export function encryptKey(orgId: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(orgId), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

/** Returns null when the value can't be decrypted (wrong APP_SECRET, other workspace, tampered). */
export function decryptKey(orgId: string, stored: string): string | null {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", derive(orgId), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch (e) {
    if (e instanceof FlowSecretMissing) throw e;
    return null;
  }
}

/** A short, safe-to-show reminder of which key is saved: "sk-ant-…a1B2". Only well-known, non-secret prefixes are shown. */
export function keyHint(key: string): string {
  const k = key.trim();
  const prefix = ["sk-ant-", "sk-proj-", "sk-or-", "sk-", "AIza"].find((p) => k.startsWith(p)) ?? "";
  return `${prefix}…${k.slice(-4)}`;
}
