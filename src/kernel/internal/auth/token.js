import {
  hmacSha256,
  sha256Hex,
} from "../driver/aws4.js";

const b64urlEncode = (value) => {
  const text = typeof value === "string" ? unescape(encodeURIComponent(value)) : value;
  const bytes = typeof text === "string" ? Array.from(text, (char) => char.charCodeAt(0)) : text;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const b64urlDecode = (value) => {
  const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
  const binary = atob(padded);
  return decodeURIComponent(escape(binary));
};

const signature = (data, secret) => b64urlEncode(hmacSha256(secret || "siyuan-cloud-token", data));

export const generateAuthToken = (user, secret, nowMs = Date.now()) => {
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(nowMs / 1000);
  const payload = b64urlEncode(JSON.stringify({
    exp: now + 48 * 3600,
    iat: now,
    iat_ms: nowMs,
    nbf: now,
    pwd_ts: Number(user?.pwd_ts || 0),
    username: user?.username || "",
  }));
  const data = `${header}.${payload}`;
  return `${data}.${signature(data, secret)}`;
};

export const parseAuthToken = (token, secret, nowMs = Date.now()) => {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("that's not even a token");
  const data = `${parts[0]}.${parts[1]}`;
  if (signature(data, secret) !== parts[2]) throw new Error("couldn't handle this token");
  const payload = JSON.parse(b64urlDecode(parts[1]));
  const now = Math.floor(nowMs / 1000);
  if (Number(payload.nbf || 0) > now) throw new Error("token not active yet");
  if (Number(payload.exp || 0) <= now) throw new Error("token is expired");
  return payload;
};

export const passwordTimestamp = () => Date.now();

const STATIC_HASH_SALT = "https://github.com/alist-org/alist";

export const staticPasswordHash = (value) => sha256Hex(`${String(value || "")}-${STATIC_HASH_SALT}`);

export const hashPassword = (staticHash, salt) => sha256Hex(`${String(staticHash || "")}-${String(salt || "")}`);

export const randomSalt = () => sha256Hex(`${Date.now()}-${Math.random()}-${Math.random()}`).slice(0, 16);

export const tokenFingerprint = (token) => sha256Hex(String(token || ""));

export const setUserPassword = (user, password, now = passwordTimestamp()) => {
  const salt = randomSalt();
  user.salt = salt;
  user.pwd_salt = salt;
  user.pwd_hash = hashPassword(staticPasswordHash(password), salt);
  user.pwd_ts = now;
  user.password = "";
  return user;
};

export const verifyPassword = (user, password) => {
  if (!user?.pwd_hash || !(user.salt || user.pwd_salt)) return !user?.password || String(password || "") === String(user.password || "");
  return user.pwd_hash === hashPassword(staticPasswordHash(password), user.salt || user.pwd_salt);
};

export const verifyStaticPasswordHash = (user, staticHash) => {
  if (!user?.pwd_hash || !(user.salt || user.pwd_salt)) {
    if (!user?.password) return !staticHash;
    return staticPasswordHash(user.password) === String(staticHash || "");
  }
  return user.pwd_hash === hashPassword(staticHash, user.salt || user.pwd_salt);
};
