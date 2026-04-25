import crypto from "crypto";

const buildKey = (secret) => crypto.createHash("sha256").update(secret).digest();

export const encryptJson = (value, secret) => {
  const iv = crypto.randomBytes(16);
  const key = buildKey(secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    value: encrypted.toString("hex")
  };
};

export const decryptJson = (payload, secret) => {
  if (!payload) {
    return null;
  }

  const key = buildKey(secret);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.value, "hex")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8"));
};
