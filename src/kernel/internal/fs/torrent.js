const MAX_TORRENT_BASE64_LEN = 14 * 1024 * 1024;

const bytesToString = (bytes) => {
  const input = Array.from(bytes || [], (byte) => String.fromCharCode(byte)).join("");
  try {
    return decodeURIComponent(escape(input));
  } catch (_) {
    return input;
  }
};

const base64ToBytes = (value) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(value || "").replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = clean[i + 2] === "=" ? -1 : chars.indexOf(clean[i + 2]);
    const d = clean[i + 3] === "=" ? -1 : chars.indexOf(clean[i + 3]);
    if (a < 0 || b < 0) throw new Error("invalid Base64 encoding");
    bytes.push((a << 2) | (b >> 4));
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) bytes.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(bytes);
};

const arrayBufferFrom = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value.map((item) => Number(item) & 0xff));
  if (value && typeof value === "object" && Array.isArray(value.data)) {
    return Uint8Array.from(value.data.map((item) => Number(item) & 0xff));
  }
  return null;
};

const firstFileBytes = (files) => {
  for (const value of Object.values(files || {})) {
    const file = Array.isArray(value) ? value[0] : value;
    const data = file?.data ?? file?.Data;
    const bytes = arrayBufferFrom(data);
    if (bytes) return bytes;
    if (typeof data === "string") return base64ToBytes(data);
  }
  return null;
};

export const torrentBytesFromRequest = (req = {}, { requireBase64 = false } = {}) => {
  const encoded = req.torrent_data || req.torrent || req.content || "";
  if (encoded) {
    if (String(encoded).length > MAX_TORRENT_BASE64_LEN) throw new Error("torrent data too large (max 10MB)");
    return base64ToBytes(encoded);
  }
  if (requireBase64) throw new Error("torrent_data is required");
  const fileBytes = firstFileBytes(req.files);
  if (fileBytes) return fileBytes;
  throw new Error("torrent file is required");
};

class BencodeParser {
  constructor(bytes) {
    this.bytes = bytes;
    this.index = 0;
  }

  readByte() {
    if (this.index >= this.bytes.length) throw new Error("unexpected end of bencode data");
    return this.bytes[this.index++];
  }

  parseValue() {
    const byte = this.readByte();
    if (byte === 0x69) return this.parseInteger();
    if (byte === 0x6c) return this.parseList();
    if (byte === 0x64) return this.parseDict();
    if (byte >= 0x30 && byte <= 0x39) {
      this.index -= 1;
      return this.parseBytes();
    }
    throw new Error(`unexpected bencode byte ${byte}`);
  }

  parseInteger() {
    let text = "";
    while (true) {
      const byte = this.readByte();
      if (byte === 0x65) break;
      text += String.fromCharCode(byte);
    }
    const number = Number(text);
    if (!Number.isFinite(number)) throw new Error("invalid bencode integer");
    return number;
  }

  parseBytes() {
    let lengthText = "";
    while (true) {
      const byte = this.readByte();
      if (byte === 0x3a) break;
      if (byte < 0x30 || byte > 0x39) throw new Error("invalid bencode string length");
      lengthText += String.fromCharCode(byte);
    }
    const length = Number(lengthText);
    if (!Number.isSafeInteger(length) || length < 0 || length > 100 * 1024 * 1024) {
      throw new Error("bencode string length out of bounds");
    }
    const end = this.index + length;
    if (end > this.bytes.length) throw new Error("unexpected end of bencode string");
    const value = this.bytes.slice(this.index, end);
    this.index = end;
    return value;
  }

  parseList() {
    const list = [];
    while (this.bytes[this.index] !== 0x65) list.push(this.parseValue());
    this.index += 1;
    return list;
  }

  parseDict() {
    const dict = {};
    while (this.bytes[this.index] !== 0x65) {
      const key = bytesToString(this.parseBytes());
      dict[key] = this.parseValue();
    }
    this.index += 1;
    return dict;
  }
}

const encodeBytes = (bytes) => Uint8Array.from([
  ...Array.from(String(bytes.length), (char) => char.charCodeAt(0)),
  0x3a,
  ...bytes,
]);

const concatBytes = (parts) => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const encodeString = (value) => {
  const text = unescape(encodeURIComponent(String(value || "")));
  return encodeBytes(Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0))));
};

const bencodeEncode = (value) => {
  if (typeof value === "number") return Uint8Array.from(Array.from(`i${Math.trunc(value)}e`, (char) => char.charCodeAt(0)));
  if (value instanceof Uint8Array) return encodeBytes(value);
  if (typeof value === "string") return encodeString(value);
  if (Array.isArray(value)) return concatBytes([
    Uint8Array.from([0x6c]),
    ...value.map(bencodeEncode),
    Uint8Array.from([0x65]),
  ]);
  if (value && typeof value === "object") {
    const parts = [Uint8Array.from([0x64])];
    for (const key of Object.keys(value).sort()) {
      parts.push(encodeString(key), bencodeEncode(value[key]));
    }
    parts.push(Uint8Array.from([0x65]));
    return concatBytes(parts);
  }
  throw new Error("unsupported bencode value");
};

const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const rol = (value, bits) => (value << bits) | (value >>> (32 - bits));

const utf8Bytes = (value) => {
  const text = unescape(encodeURIComponent(String(value || "")));
  return Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0)));
};

export const bytesToBase64 = (bytes) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (b >> 4)];
    output += hasB ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    output += hasC ? chars[c & 63] : "=";
  }
  return output;
};

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
      b = (b + rol((a + f + k[i] + view.getUint32(offset + g * 4, true)) >>> 0, s[i])) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((value, index) => outView.setUint32(index * 4, value, true));
  return hex(out);
};

class HashWriter {
  constructor(pieceLength = DEFAULT_TORRENT_PIECE_SIZE) {
    this.pieceLength = Math.max(1, Number(pieceLength || DEFAULT_TORRENT_PIECE_SIZE));
    this.bytes = [];
    this.fileBytes = [];
    this.pieces = [];
    this.sliceMd5s = [];
  }

  write(chunk) {
    const data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk || []);
    if (!data.length) return;
    this.fileBytes.push(data);
    for (let offset = 0; offset < data.length;) {
      const remain = this.pieceLength - this.bytes.length;
      const part = data.slice(offset, offset + remain);
      this.bytes.push(...part);
      offset += part.length;
      if (this.bytes.length >= this.pieceLength) this.finishPiece();
    }
  }

  finishPiece() {
    const piece = Uint8Array.from(this.bytes);
    this.pieces.push(sha1Bytes(piece));
    this.sliceMd5s.push(md5Hex(piece).toUpperCase());
    this.bytes = [];
  }

  finish() {
    if (this.bytes.length || !this.pieces.length) this.finishPiece();
  }

  source() {
    return concatBytes(this.fileBytes);
  }
}

const sha1Bytes = (message) => {
  const bitLen = message.length * 8;
  const paddedLen = (((message.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLen);
  padded.set(message);
  padded[message.length] = 0x80;
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

const asText = (value) => value instanceof Uint8Array ? bytesToString(value) : String(value || "");
const asNumber = (value) => Number(value || 0);
export const DEFAULT_TORRENT_PIECE_SIZE = 10 * 1024 * 1024;

export const parseTorrentBytes = (bytes) => {
  const parser = new BencodeParser(bytes);
  const root = parser.parseValue();
  if (!root || typeof root !== "object" || Array.isArray(root)) throw new Error("torrent: root is not a dict");
  const info = root.info;
  if (!info || typeof info !== "object" || Array.isArray(info)) throw new Error("torrent: info is not a dict");
  const pieces = info.pieces instanceof Uint8Array ? info.pieces : new Uint8Array();
  if (pieces.length % 20 !== 0) throw new Error("torrent pieces data is invalid: length must be a multiple of 20");
  const files = Array.isArray(info.files) && info.files.length
    ? info.files.map((file) => ({
        path: Array.isArray(file.path) ? file.path.map(asText).join("/") : "",
        size: asNumber(file.length),
      }))
    : [{ path: asText(info.name), size: asNumber(info.length) }];
  const totalSize = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const cas = root["x-cas"] && typeof root["x-cas"] === "object" ? root["x-cas"] : null;
  const hasCas = !!(cas && cas.file_md5 && cas.slice_md5);
  return {
    name: asText(info.name),
    total_size: totalSize,
    piece_length: asNumber(info["piece length"]),
    piece_count: pieces.length / 20,
    info_hash: hex(sha1Bytes(bencodeEncode(info))),
    files,
    has_cas: hasCas,
    ...(hasCas ? {
      cas: {
        file_md5: asText(cas.file_md5),
        slice_md5: asText(cas.slice_md5),
        slice_size: asNumber(cas.slice_size),
        cloud: asText(cas.cloud),
      },
    } : {}),
  };
};

export const generateTorrentBytes = (bytes, {
  createdBy = "OpenList",
  name = "download.bin",
  pieceLength = DEFAULT_TORRENT_PIECE_SIZE,
  withCas = false,
} = {}) => {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const pieceSize = Math.max(1, Number(pieceLength || DEFAULT_TORRENT_PIECE_SIZE));
  const pieces = [];
  const sliceMd5s = [];
  for (let offset = 0; offset < source.length || (source.length === 0 && offset === 0); offset += pieceSize) {
    const chunk = source.slice(offset, Math.min(offset + pieceSize, source.length));
    pieces.push(sha1Bytes(chunk));
    sliceMd5s.push(md5Hex(chunk).toUpperCase());
    if (source.length === 0) break;
  }
  const fileMd5 = md5Hex(source).toUpperCase();
  const info = {
    length: source.length,
    md5sum: fileMd5,
    name,
    "piece length": pieceSize,
    pieces: concatBytes(pieces),
  };
  const root = {
    comment: withCas ? "Generated by OpenList with CAS extension" : "Generated by OpenList",
    "created by": createdBy,
    "creation date": Math.floor(Date.now() / 1000),
    info,
  };
  if (withCas) {
    root["x-cas"] = {
      cloud: "189",
      file_md5: fileMd5,
      slice_md5: sliceMd5s.length > 1 ? md5Hex(sliceMd5s.join("\n")).toUpperCase() : fileMd5,
      slice_md5s: sliceMd5s,
      slice_size: pieceSize,
    };
  }
  const torrent = bencodeEncode(root);
  return {
    info_hash: hex(sha1Bytes(bencodeEncode(info))),
    torrent,
  };
};

export const generateTorrentFromChunks = (chunks, {
  createdBy = "OpenList",
  name = "download.bin",
  pieceLength = DEFAULT_TORRENT_PIECE_SIZE,
  size = 0,
  withCas = false,
} = {}) => {
  const writer = new HashWriter(pieceLength);
  for (const chunk of chunks || []) writer.write(chunk);
  writer.finish();
  const source = writer.source();
  const fileMd5 = md5Hex(source).toUpperCase();
  const pieceSize = Math.max(1, Number(pieceLength || DEFAULT_TORRENT_PIECE_SIZE));
  const info = {
    length: Number(size || source.length),
    md5sum: fileMd5,
    name,
    "piece length": pieceSize,
    pieces: concatBytes(writer.pieces),
  };
  const root = {
    comment: withCas ? "Generated by OpenList with CAS extension" : "Generated by OpenList",
    "created by": createdBy,
    "creation date": Math.floor(Date.now() / 1000),
    info,
  };
  if (withCas) {
    root["x-cas"] = {
      cloud: "189",
      file_md5: fileMd5,
      slice_md5: writer.sliceMd5s.length > 1 ? md5Hex(writer.sliceMd5s.join("\n")).toUpperCase() : fileMd5,
      slice_md5s: writer.sliceMd5s,
      slice_size: pieceSize,
    };
  }
  const torrent = bencodeEncode(root);
  return {
    info_hash: hex(sha1Bytes(bencodeEncode(info))),
    torrent,
  };
};
