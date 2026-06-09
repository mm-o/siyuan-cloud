import { basenameOf, dirnameOf } from "../common.js";
import { forwardProxy, remoteJson } from "../http.js";

const DEFAULT_SLICE_SIZE = 10485760;

export const utf8Bytes = (value) => {
  const text = unescape(encodeURIComponent(String(value || "")));
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
  return out;
};

const base64ToBytes = (value) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(value || "").replace(/[\r\n\s]/g, "");
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = clean[i + 2] === "=" ? -1 : chars.indexOf(clean[i + 2]);
    const d = clean[i + 3] === "=" ? -1 : chars.indexOf(clean[i + 3]);
    if (a < 0 || b < 0) continue;
    out.push((a << 2) | (b >> 4));
    if (c >= 0) out.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(out);
};

export const bytesToBase64 = (bytes) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | ((b || 0) >> 4)];
    out += i + 1 < bytes.length ? chars[((b & 15) << 2) | ((c || 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[c & 63] : "=";
  }
  return out;
};

const uploadBytes = (content, options = {}) => options.bodyEncoding === "base64"
  ? base64ToBytes(content || "")
  : utf8Bytes(content || "");

const hex = (input) => Array.from(input, (b) => b.toString(16).padStart(2, "0")).join("");
const leftRotate = (value, amount) => (value << amount) | (value >>> (32 - amount));

const md5Hex = (input) => {
  const source = input instanceof Uint8Array ? input : utf8Bytes(input);
  const bitLen = source.length * 8;
  const paddedLen = (((source.length + 9 + 63) >> 6) << 6);
  const bytes = new Uint8Array(paddedLen);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    let a = a0; let b = b0; let c = c0; let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f; let g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d;
      d = c;
      c = b;
      b = (b + leftRotate((a + f + k[i] + view.getUint32(offset + g * 4, true)) >>> 0, s[i])) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((value, index) => outView.setUint32(index * 4, value, true));
  return hex(out);
};

const md5Bytes = (input) => {
  const clean = md5Hex(input);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const rol = (value, bits) => (value << bits) | (value >>> (32 - bits));
const sha1Bytes = (message) => {
  const msg = message instanceof Uint8Array ? message : utf8Bytes(message);
  const bitLen = msg.length * 8;
  const paddedLen = (((msg.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLen);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000));
  let h0 = 0x67452301; let h1 = 0xefcdab89; let h2 = 0x98badcfe; let h3 = 0x10325476; let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i += 1) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1) >>> 0;
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
    for (let i = 0; i < 80; i += 1) {
      let f; let k;
      if (i < 20) { f = (b & c) | ((~b) & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (rol(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rol(b, 30) >>> 0; b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((value, index) => outView.setUint32(index * 4, value));
  return out;
};

const hmacSha1 = (data, secret) => {
  let keyBytes = utf8Bytes(secret);
  if (keyBytes.length > 64) keyBytes = sha1Bytes(keyBytes);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    const b = keyBytes[i] || 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  const msg = utf8Bytes(data);
  const inner = new Uint8Array(ipad.length + msg.length);
  inner.set(ipad);
  inner.set(msg, ipad.length);
  const outer = new Uint8Array(opad.length + 20);
  outer.set(opad);
  outer.set(sha1Bytes(inner), opad.length);
  return hex(sha1Bytes(outer));
};

export const randomHex = (pattern) => pattern.replace(/[xy]/g, (char) => {
  const t = Math.floor(16 * Math.random());
  const value = char === "x" ? t : ((3 & t) | 8);
  return value.toString(16);
});

export const qs = (form) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(form || {})) params.set(key, String(value));
  return Array.from(params.entries()).map(([key, value]) => `${key}=${value}`).join("&");
};

export const encode = (value) => encodeURIComponent(String(value || ""));
const decodeURIComponent189 = (value) => {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (_) {
    return String(value || "");
  }
};

const sbox = Uint8Array.from([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);

const rcon = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
const xtime = (value) => ((value << 1) ^ (value & 0x80 ? 0x1b : 0)) & 0xff;
const addRoundKey = (state, keys, round) => {
  for (let i = 0; i < 16; i += 1) state[i] ^= keys[round * 16 + i];
};
const subBytes = (state) => {
  for (let i = 0; i < 16; i += 1) state[i] = sbox[state[i]];
};
const shiftRows = (state) => {
  const copy = Uint8Array.from(state);
  state[1] = copy[5]; state[5] = copy[9]; state[9] = copy[13]; state[13] = copy[1];
  state[2] = copy[10]; state[6] = copy[14]; state[10] = copy[2]; state[14] = copy[6];
  state[3] = copy[15]; state[7] = copy[3]; state[11] = copy[7]; state[15] = copy[11];
};
const mixColumns = (state) => {
  for (let c = 0; c < 4; c += 1) {
    const i = c * 4;
    const a0 = state[i]; const a1 = state[i + 1]; const a2 = state[i + 2]; const a3 = state[i + 3];
    const t = a0 ^ a1 ^ a2 ^ a3;
    state[i] ^= t ^ xtime(a0 ^ a1);
    state[i + 1] ^= t ^ xtime(a1 ^ a2);
    state[i + 2] ^= t ^ xtime(a2 ^ a3);
    state[i + 3] ^= t ^ xtime(a3 ^ a0);
  }
};
const expandKey = (key) => {
  const expanded = new Uint8Array(176);
  expanded.set(key.slice(0, 16));
  let bytesGenerated = 16;
  let rconIteration = 1;
  const temp = new Uint8Array(4);
  while (bytesGenerated < 176) {
    temp.set(expanded.slice(bytesGenerated - 4, bytesGenerated));
    if (bytesGenerated % 16 === 0) {
      const first = temp[0];
      temp[0] = sbox[temp[1]] ^ rcon[rconIteration];
      temp[1] = sbox[temp[2]];
      temp[2] = sbox[temp[3]];
      temp[3] = sbox[first];
      rconIteration += 1;
    }
    for (let i = 0; i < 4; i += 1) {
      expanded[bytesGenerated] = expanded[bytesGenerated - 16] ^ temp[i];
      bytesGenerated += 1;
    }
  }
  return expanded;
};
const aesBlockEncrypt = (block, keys) => {
  const state = Uint8Array.from(block);
  addRoundKey(state, keys, 0);
  for (let round = 1; round < 10; round += 1) {
    subBytes(state);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, keys, round);
  }
  subBytes(state);
  shiftRows(state);
  addRoundKey(state, keys, 10);
  return state;
};
const pkcs7Padding = (data, blockSize) => {
  const padding = blockSize - (data.length % blockSize);
  const out = new Uint8Array(data.length + padding);
  out.set(data);
  out.fill(padding, data.length);
  return out;
};
const aesEncrypt = (data, key) => {
  const keys = expandKey(key.slice(0, 16));
  const padded = pkcs7Padding(data, 16);
  const out = new Uint8Array(padded.length);
  for (let offset = 0; offset < padded.length; offset += 16) {
    out.set(aesBlockEncrypt(padded.slice(offset, offset + 16), keys), offset);
  }
  return out;
};

const randomNonZeroByte = () => {
  let value = 0;
  while (value === 0) value = Math.floor(Math.random() * 256);
  return value;
};
const bytesToBigInt = (input) => BigInt(`0x${hex(input) || "0"}`);
const bigIntToBytes = (value, length) => {
  let clean = value.toString(16);
  if (clean.length % 2) clean = `0${clean}`;
  const out = new Uint8Array(length);
  const start = Math.max(0, length - clean.length / 2);
  for (let i = 0; i < Math.min(length, clean.length / 2); i += 1) {
    out[start + i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};
const modPow = (base, exponent, modulus) => {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
};
const readDerLength = (bytes, cursor) => {
  let length = bytes[cursor.index];
  cursor.index += 1;
  if (length < 0x80) return length;
  const count = length & 0x7f;
  length = 0;
  for (let i = 0; i < count; i += 1) {
    length = (length << 8) | bytes[cursor.index];
    cursor.index += 1;
  }
  return length;
};
const readDer = (bytes, cursor, tag) => {
  if (bytes[cursor.index] !== tag) throw new Error("invalid 189Cloud RSA public key");
  cursor.index += 1;
  const length = readDerLength(bytes, cursor);
  const start = cursor.index;
  cursor.index += length;
  return bytes.slice(start, start + length);
};
const parseRsaPublicKey = (jRsakey) => {
  const der = base64ToBytes(String(jRsakey || "").replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  const outerCursor = { index: 0 };
  const spki = readDer(der, outerCursor, 0x30);
  const spkiCursor = { index: 0 };
  readDer(spki, spkiCursor, 0x30);
  const bitString = readDer(spki, spkiCursor, 0x03);
  const rsaDer = bitString.slice(1);
  const rsaCursor = { index: 0 };
  const sequence = readDer(rsaDer, rsaCursor, 0x30);
  const seqCursor = { index: 0 };
  let modulus = readDer(sequence, seqCursor, 0x02);
  const exponent = readDer(sequence, seqCursor, 0x02);
  while (modulus.length > 1 && modulus[0] === 0) modulus = modulus.slice(1);
  return { exponent: bytesToBigInt(exponent), modulus: bytesToBigInt(modulus), size: modulus.length };
};
const b64map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const biRm = "0123456789abcdefghijklmnopqrstuvwxyz";
const int2char = (value) => biRm[value];
const b64tohex = (value) => {
  let out = "";
  let e = 0;
  let c = 0;
  for (const item of String(value || "")) {
    if (item === "=") continue;
    const v = b64map.indexOf(item);
    if (v < 0) continue;
    if (e === 0) {
      e = 1;
      out += int2char(v >> 2);
      c = 3 & v;
    } else if (e === 1) {
      e = 2;
      out += int2char((c << 2) | (v >> 4));
      c = 15 & v;
    } else if (e === 2) {
      e = 3;
      out += int2char(c);
      out += int2char(v >> 2);
      c = 3 & v;
    } else {
      e = 0;
      out += int2char((c << 2) | (v >> 4));
      out += int2char(15 & v);
    }
  }
  if (e === 1) out += int2char(c << 2);
  return out;
};
export const rsaEncode = (origData, jRsakey, hexOutput) => {
  const { exponent, modulus, size } = parseRsaPublicKey(jRsakey);
  if (origData.length > size - 11) throw new Error("189Cloud RSA payload too large");
  const encoded = new Uint8Array(size);
  encoded[0] = 0x00;
  encoded[1] = 0x02;
  const padEnd = size - origData.length - 1;
  for (let i = 2; i < padEnd; i += 1) encoded[i] = randomNonZeroByte();
  encoded[padEnd] = 0x00;
  encoded.set(origData, padEnd + 1);
  const encrypted = bigIntToBytes(modPow(bytesToBigInt(encoded), exponent, modulus), size);
  const b64 = bytesToBase64(encrypted);
  return hexOutput ? b64tohex(b64) : b64;
};

const getSessionKey = async (client, storage) => {
  const resp = await remoteJson(client, "https://cloud.189.cn/v2/getUserBriefInfo.action", {
    allowErrorStatus: true,
    headers: {
      Accept: "application/json;charset=UTF-8",
      Cookie: storage.addition_json.cookie || storage.addition_json.Cookie || "",
      Referer: "https://cloud.189.cn/",
      "User-Agent": "Mozilla/5.0",
    },
    method: "GET",
  });
  const sessionKey = resp?.sessionKey || "";
  if (!sessionKey) throw new Error("get 189Cloud sessionKey failed");
  return sessionKey;
};

const getResKey = async (client, storage) => {
  const addition = storage.addition_json || {};
  const now = Date.now();
  if (Number(addition.rsa_expire || addition.rsaExpire || 0) > now && (addition.rsa_pub_key || addition.pubKey) && (addition.rsa_pk_id || addition.pkId)) {
    return {
      pubKey: addition.rsa_pub_key || addition.pubKey,
      pkId: addition.rsa_pk_id || addition.pkId,
    };
  }
  const resp = await remoteJson(client, "https://cloud.189.cn/api/security/generateRsaKey.action", {
    allowErrorStatus: true,
    headers: {
      Accept: "application/json;charset=UTF-8",
      Cookie: addition.cookie || addition.Cookie || "",
      Referer: "https://cloud.189.cn/",
      "User-Agent": "Mozilla/5.0",
    },
    method: "GET",
  });
  if (!resp?.pubKey || !resp?.pkId) throw new Error("get 189Cloud rsa key failed");
  addition.rsa_pub_key = resp.pubKey;
  addition.rsa_pk_id = resp.pkId;
  addition.rsa_expire = resp.expire;
  return { pubKey: resp.pubKey, pkId: resp.pkId };
};

export const uploadRequest189 = async (client, storage, uri, form, sessionKey) => {
  const date = String(Date.now());
  const requestId = randomHex("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx");
  let key = randomHex("xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx");
  key = key.slice(0, 16 + Math.floor(16 * Math.random()));
  const plain = qs(form);
  const encrypted = aesEncrypt(utf8Bytes(plain), utf8Bytes(key.slice(0, 16)));
  const params = hex(encrypted);
  const signature = hmacSha1(`SessionKey=${sessionKey}&Operate=GET&RequestURI=${uri}&Date=${date}&params=${params}`, key);
  const { pubKey, pkId } = await getResKey(client, storage);
  const encryptionText = rsaEncode(utf8Bytes(key), pubKey, false);
  const resp = await remoteJson(client, `https://upload.cloud.189.cn${uri}?params=${params}`, {
    allowErrorStatus: true,
    headers: {
      accept: "application/json;charset=UTF-8",
      SessionKey: sessionKey,
      Signature: signature,
      "X-Request-Date": date,
      "X-Request-ID": requestId,
      EncryptionText: encryptionText,
      PkId: pkId,
    },
    method: "GET",
  });
  if (resp?.code !== "SUCCESS") throw new Error(`${uri}---${resp?.msg || resp?.code || "189Cloud upload request failed"}`);
  return resp;
};

const parseUploadHeaders = (value) => {
  const headers = {};
  for (const item of decodeURIComponent189(value).split("&")) {
    const index = item.indexOf("=");
    if (index <= 0) continue;
    headers[item.slice(0, index)] = item.slice(index + 1);
  }
  return headers;
};

const sliceMd5 = (bytes) => {
  const md5s = [];
  for (let offset = 0; offset < bytes.length; offset += DEFAULT_SLICE_SIZE) {
    md5s.push(md5Hex(bytes.slice(offset, Math.min(offset + DEFAULT_SLICE_SIZE, bytes.length))).toUpperCase());
  }
  if (!md5s.length) md5s.push(md5Hex(new Uint8Array()).toUpperCase());
  return bytes.length > DEFAULT_SLICE_SIZE ? md5Hex(md5s.join("\n")) : md5s[0].toLowerCase();
};

export const put189 = async (client, storage, resolveFile, relPath, content, mime, options = {}) => {
  const dstDir = await resolveFile(client, storage, dirnameOf(relPath));
  const bytes = uploadBytes(content, options);
  const sessionKey = await getSessionKey(client, storage);
  const fileMd5 = md5Hex(bytes);
  const sliceMd5Hex = sliceMd5(bytes);
  const init = await uploadRequest189(client, storage, "/person/initMultiUpload", {
    parentFolderId: String(dstDir.id || ""),
    fileName: encode(basenameOf(relPath)),
    fileSize: String(bytes.length),
    sliceSize: String(DEFAULT_SLICE_SIZE),
    fileMd5,
    sliceMd5: sliceMd5Hex,
  }, sessionKey);
  const uploadFileId = init?.data?.uploadFileId || "";
  if (!uploadFileId) throw new Error("189Cloud initMultiUpload missing uploadFileId");
  if (Number(init?.data?.fileDataExists || 0) === 1) {
    await uploadRequest189(client, storage, "/person/commitMultiUploadFile", {
      uploadFileId,
      fileMd5,
      sliceMd5: sliceMd5Hex,
      lazyCheck: "1",
      opertype: "3",
    }, sessionKey);
    return;
  }
  const count = Math.ceil(bytes.length / DEFAULT_SLICE_SIZE) || 1;
  for (let index = 1; index <= count; index += 1) {
    const start = (index - 1) * DEFAULT_SLICE_SIZE;
    const chunk = bytes.slice(start, Math.min(start + DEFAULT_SLICE_SIZE, bytes.length));
    const urls = await uploadRequest189(client, storage, "/person/getMultiUploadUrls", {
      partInfo: `${index}-${bytesToBase64(md5Bytes(chunk))}`,
      uploadFileId,
    }, sessionKey);
    const uploadData = urls?.uploadUrls?.[`partNumber_${index}`] || {};
    if (!uploadData.requestURL) throw new Error(`189Cloud getMultiUploadUrls missing partNumber_${index}`);
    await forwardProxy(client, uploadData.requestURL, {
      body: bytesToBase64(chunk),
      contentType: mime || "application/octet-stream",
      headers: parseUploadHeaders(uploadData.requestHeader),
      method: "PUT",
      payloadEncoding: "base64",
      responseEncoding: "text",
    });
  }
  await uploadRequest189(client, storage, "/person/commitMultiUploadFile", {
    uploadFileId,
    fileMd5,
    sliceMd5: sliceMd5Hex,
    lazyCheck: "1",
    opertype: "3",
  }, sessionKey);
};
