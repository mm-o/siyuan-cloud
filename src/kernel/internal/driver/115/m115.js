const N = BigInt("0x8686980c0f5a24c4b9d43020cd2c22703ff3f450756529058b1cf88f09b8602136477198a6e2683149659bd122c33592fdb5ad47944ad1ea4d36c6b172aad6338c3bb6ac6227502d010993ac967d1aef00f0c8e038de2e4d3bc2ec368af2e9f10a6f1eda4f7262f136420c07c331b871bf139f74f3010e3c4fe57df3afb71683");
const E = BigInt("0x10001");
const KEY_LENGTH = 128;

const xorKeySeed = [
  0xf0, 0xe5, 0x69, 0xae, 0xbf, 0xdc, 0xbf, 0x8a, 0x1a, 0x45, 0xe8, 0xbe, 0x7d, 0xa6, 0x73, 0xb8,
  0xde, 0x8f, 0xe7, 0xc4, 0x45, 0xda, 0x86, 0xc4, 0x9b, 0x64, 0x8b, 0x14, 0x6a, 0xb4, 0xf1, 0xaa,
  0x38, 0x01, 0x35, 0x9e, 0x26, 0x69, 0x2c, 0x86, 0x00, 0x6b, 0x4f, 0xa5, 0x36, 0x34, 0x62, 0xa6,
  0x2a, 0x96, 0x68, 0x18, 0xf2, 0x4a, 0xfd, 0xbd, 0x6b, 0x97, 0x8f, 0x4d, 0x8f, 0x89, 0x13, 0xb7,
  0x6c, 0x8e, 0x93, 0xed, 0x0e, 0x0d, 0x48, 0x3e, 0xd7, 0x2f, 0x88, 0xd8, 0xfe, 0xfe, 0x7e, 0x86,
  0x50, 0x95, 0x4f, 0xd1, 0xeb, 0x83, 0x26, 0x34, 0xdb, 0x66, 0x7b, 0x9c, 0x7e, 0x9d, 0x7a, 0x81,
  0x32, 0xea, 0xb6, 0x33, 0xde, 0x3a, 0xa9, 0x59, 0x34, 0x66, 0x3b, 0xaa, 0xba, 0x81, 0x60, 0x48,
  0xb9, 0xd5, 0x81, 0x9c, 0xf8, 0x6c, 0x84, 0x77, 0xff, 0x54, 0x78, 0x26, 0x5f, 0xbe, 0xe8, 0x1e,
  0x36, 0x9f, 0x34, 0x80, 0x5c, 0x45, 0x2c, 0x9b, 0x76, 0xd5, 0x1b, 0x8f, 0xcc, 0xc3, 0xb8, 0xf5,
];
const xorClientKey = [0x78, 0x06, 0xad, 0x4c, 0x33, 0x86, 0x5d, 0x18, 0x4c, 0x01, 0x3f, 0x46];

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const utf8Bytes = (value) => {
  const text = unescape(encodeURIComponent(String(value || "")));
  return Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
};

const utf8Text = (bytes) => {
  const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  try {
    return decodeURIComponent(escape(binary));
  } catch (_) {
    return binary;
  }
};

const bytesToBase64 = (bytes) => {
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

const base64ToBytes = (value) => {
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

const modPow = (base, exp, mod) => {
  let result = 1n;
  let value = base % mod;
  let power = exp;
  while (power > 0n) {
    if (power & 1n) result = (result * value) % mod;
    value = (value * value) % mod;
    power >>= 1n;
  }
  return result;
};

const bytesToBigInt = (bytes) => {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  return value;
};

const bigIntToBytes = (value, length) => {
  const out = new Uint8Array(length);
  let current = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(current & 0xffn);
    current >>= 8n;
  }
  return out;
};

const randomNonZero = () => Math.max(1, Math.floor(Math.random() * 255));

const rsaEncryptSlice = (input) => {
  const padSize = KEY_LENGTH - input.length - 3;
  const block = new Uint8Array(KEY_LENGTH);
  block[0] = 0;
  block[1] = 2;
  for (let i = 0; i < padSize; i += 1) block[2 + i] = randomNonZero();
  block[padSize + 2] = 0;
  block.set(input, padSize + 3);
  return bigIntToBytes(modPow(bytesToBigInt(block), E, N), KEY_LENGTH);
};

const rsaEncrypt = (input) => {
  const chunks = [];
  for (let i = 0; i < input.length; i += KEY_LENGTH - 11) {
    chunks.push(rsaEncryptSlice(input.slice(i, i + KEY_LENGTH - 11)));
  }
  return Uint8Array.from(chunks.flatMap((chunk) => [...chunk]));
};

const rsaDecryptSlice = (input) => {
  const data = bigIntToBytes(modPow(bytesToBigInt(input), E, N), KEY_LENGTH);
  const start = data.findIndex((byte, index) => index > 0 && byte === 0);
  return start >= 0 ? data.slice(start + 1) : new Uint8Array();
};

const rsaDecrypt = (input) => {
  const chunks = [];
  for (let i = 0; i < input.length; i += KEY_LENGTH) chunks.push(rsaDecryptSlice(input.slice(i, i + KEY_LENGTH)));
  return Uint8Array.from(chunks.flatMap((chunk) => [...chunk]));
};

const xorDeriveKey = (seed, size) => {
  const key = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    key[i] = ((seed[i] + xorKeySeed[size * i]) & 0xff) ^ xorKeySeed[size * (size - i - 1)];
  }
  return key;
};

const xorTransform = (data, key) => {
  const mod = data.length % 4;
  for (let i = 0; i < data.length; i += 1) {
    const keyIndex = i < mod ? i % key.length : (i - mod) % key.length;
    data[i] ^= key[keyIndex];
  }
};

const reverse = (data) => data.reverse();

export const generateKey = () => Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));

export const encode115 = (input, key = generateKey()) => {
  const bytes = utf8Bytes(input);
  const buf = new Uint8Array(16 + bytes.length);
  buf.set(key, 0);
  buf.set(bytes, 16);
  const body = buf.slice(16);
  xorTransform(body, xorDeriveKey(key, 4));
  reverse(body);
  xorTransform(body, xorClientKey);
  buf.set(body, 16);
  return bytesToBase64(rsaEncrypt(buf));
};

export const decode115WithKey = (input, key) => {
  const data = rsaDecrypt(base64ToBytes(input));
  const decodeKey = key || data.slice(0, 16);
  const output = data.slice(16);
  xorTransform(output, xorDeriveKey(data.slice(0, 16), 12));
  reverse(output);
  xorTransform(output, xorDeriveKey(decodeKey, 4));
  return {
    key: data.slice(0, 16),
    text: utf8Text(output),
  };
};

export const decode115 = (input, key) => decode115WithKey(input, key).text;
