import path from "node:path";

const baseDir = path.resolve(process.cwd(), "..");

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "forgeops-local-dev-secret",
  jwtTtlSeconds: 60 * 30,
  idleTimeoutSeconds: 60 * 30,
  accountLockMinutes: 15,
  maxFailedLogins: 5,
  uploadDir: process.env.UPLOAD_DIR || path.join(baseDir, "storage", "uploads"),
  exportDir: process.env.EXPORT_DIR || path.join(baseDir, "storage", "message_exports"),
  encryptionKeyHex:
    process.env.ENCRYPTION_KEY_HEX ||
    "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "forgeops",
    connectionLimit: 10
  }
};
