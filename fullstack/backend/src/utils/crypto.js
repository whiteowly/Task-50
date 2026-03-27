import crypto from "node:crypto";
import { config } from "../config.js";

const key = Buffer.from(config.encryptionKeyHex, "hex");

export function encryptString(value) {
  if (value == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptString(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]);
  return clear.toString("utf8");
}

export function maskSensitive(value, allowed) {
  if (value == null) return null;
  if (allowed) return value;
  const str = String(value);
  if (str.length <= 2) return "**";
  return `${"*".repeat(str.length - 2)}${str.slice(-2)}`;
}
