import {
  gunzipSync,
  inflateSync,
} from "fflate";
import { decodeGbk } from "./gbk.js";

export const acceptedArchiveExtensions = () => [
  ".7z",
  ".7z.001",
  ".br",
  ".bz2",
  ".gz",
  ".iso",
  ".lz",
  ".lz4",
  ".mz",
  ".part1.rar",
  ".rar",
  ".s2",
  ".sz",
  ".tar",
  ".tbz2",
  ".tgz",
  ".tlz",
  ".tlz4",
  ".txz",
  ".tzst",
  ".xz",
  ".zip",
  ".zip.001",
  ".zst",
  ".zz",
];

const base64ToBytes = (value) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(value || "").replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = clean[i + 2] === "=" ? -1 : chars.indexOf(clean[i + 2]);
    const d = clean[i + 3] === "=" ? -1 : chars.indexOf(clean[i + 3]);
    if (a < 0 || b < 0) continue;
    bytes.push((a << 2) | (b >> 4));
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) bytes.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(bytes);
};

const encodeUtf8 = (value) => {
  const bytes = [];
  for (const char of String(value || "")) {
    const code = char.codePointAt(0) || 0;
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
};

const decodeUtf8 = (bytes) => {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let result = "";
  for (let i = 0; i < input.length;) {
    const first = input[i++];
    if (first < 0x80) {
      result += String.fromCharCode(first);
    } else if ((first & 0xe0) === 0xc0 && i < input.length && (input[i] & 0xc0) === 0x80) {
      const second = input[i++];
      result += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
    } else if ((first & 0xf0) === 0xe0 && i + 1 < input.length && (input[i] & 0xc0) === 0x80 && (input[i + 1] & 0xc0) === 0x80) {
      const second = input[i++];
      const third = input[i++];
      result += String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
    } else if ((first & 0xf8) === 0xf0 && i + 2 < input.length && (input[i] & 0xc0) === 0x80 && (input[i + 1] & 0xc0) === 0x80 && (input[i + 2] & 0xc0) === 0x80) {
      const second = input[i++];
      const third = input[i++];
      const fourth = input[i++];
      const code = ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
      result += code <= 0x10ffff ? String.fromCodePoint(code) : "\uFFFD";
    } else {
      result += "\uFFFD";
    }
  }
  return result;
};

const dosDateTimeToIso = (date, time) => {
  const day = date & 31;
  const month = (date >> 5) & 15;
  const year = ((date >> 9) & 127) + 1980;
  const second = (time & 31) * 2;
  const minute = (time >> 5) & 63;
  const hour = (time >> 11) & 31;
  if (!day || !month) return new Date(0).toISOString();
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
};

export const zipFilenameDecoder = (bytes, options = {}) => {
  if (!options.utf8) return decodeGbk(bytes);
  return decodeUtf8(bytes);
};

const decodeZipName = (bytes, utf8, decoder) => {
  if (decoder) {
    try {
      const decoded = decoder(bytes, { utf8 });
      if (decoded) return decoded;
    } catch (_) {
      // Fall through to the kernel-safe decoder.
    }
  }
  return zipFilenameDecoder(bytes, { utf8 });
};

const normalizeArchiveInnerPath = (path) => {
  const parts = String(path || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  return parts.join("/");
};

const findEndOfCentralDirectory = (view) => {
  const min = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("invalid zip: end of central directory not found");
};

const objType = (name, isDir) => {
  if (isDir) return 1;
  const ext = String(name || "").toLowerCase().split(".").pop() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return 2;
  if (["mp4", "mkv", "mov", "avi", "webm", "m4v"].includes(ext)) return 3;
  if (["mp3", "flac", "wav", "ogg", "m4a"].includes(ext)) return 4;
  if (["zip", "7z", "rar", "tar", "gz", "bz2"].includes(ext)) return 5;
  if (["pdf", "epub", "txt", "md", "json", "yaml", "yml", "csv", "log"].includes(ext)) return 6;
  return 0;
};

const toArchiveObjResp = (node) => ({
  name: node.name,
  size: node.size || 0,
  is_dir: !!node.is_dir,
  modified: node.modified,
  created: node.created || node.modified,
  sign: "",
  thumb: "",
  type: objType(node.name, node.is_dir),
  hashinfo: "",
  hash_info: {},
});

const sortNodes = (nodes) => nodes.sort((a, b) => {
  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
  return a.name.localeCompare(b.name);
});

const nodeToContent = (node) => ({
  ...toArchiveObjResp(node),
  children: node.children ? sortNodes([...node.children.values()]).map(nodeToContent) : [],
});

export const entryBytes = (entry) => {
  if (!entry || entry.is_dir) throw new Error("object not found");
  if (String(entry.body_encoding || "").startsWith("base64")) {
    return base64ToBytes(entry.content || "");
  }
  return encodeUtf8(entry.content || "");
};

const octal = (bytes) => {
  const text = decodeUtf8(bytes).replace(/\0.*$/, "").trim();
  return text ? Number.parseInt(text, 8) || 0 : 0;
};

const trimNull = (bytes) => decodeUtf8(bytes).replace(/\0.*$/, "");

const parseTarArchive = (bytes, options = {}) => {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const data = options.gzip ? gunzipSync(source) : source;
  const root = {
    name: "",
    is_dir: true,
    size: 0,
    modified: new Date(0).toISOString(),
    created: new Date(0).toISOString(),
    children: new Map(),
  };
  const files = [];
  const filesByPath = new Map();
  const ensureDir = (parts, modified) => {
    let current = root;
    for (const part of parts) {
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          is_dir: true,
          size: 0,
          modified,
          created: modified,
          children: new Map(),
        });
      }
      current = current.children.get(part);
    }
    return current;
  };
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = trimNull(header.slice(0, 100));
    const prefix = trimNull(header.slice(345, 500));
    const fullName = normalizeArchiveInnerPath(prefix ? `${prefix}/${name}` : name);
    const size = octal(header.slice(124, 136));
    const mtime = octal(header.slice(136, 148));
    const typeflag = header[156];
    const modified = new Date((mtime || 0) * 1000).toISOString();
    const bodyStart = offset + 512;
    const isDir = typeflag === 53 || fullName.endsWith("/");
    if (fullName) {
      const parts = fullName.split("/");
      const leaf = parts.pop();
      const parent = ensureDir(parts, modified);
      if (isDir) {
        ensureDir([...parts, leaf], modified);
      } else if (typeflag === 0 || typeflag === 48) {
        const node = {
          name: leaf,
          is_dir: false,
          size,
          modified,
          created: modified,
          archive_path: [...parts, leaf].join("/"),
          body_offset: bodyStart,
          method: "tar",
        };
        parent.children.set(leaf, node);
        files.push(node);
        filesByPath.set(node.archive_path, node);
      }
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return {
    comment: "",
    encrypted: false,
    files,
    tree: sortNodes([...root.children.values()]).map(nodeToContent),
    list(innerPath = "/") {
      const parts = normalizeArchiveInnerPath(innerPath).split("/").filter(Boolean);
      let current = root;
      for (const part of parts) {
        current = current.children.get(part);
        if (!current || !current.is_dir) return [];
      }
      return sortNodes([...current.children.values()]).map(toArchiveObjResp);
    },
    file_count: files.length,
    entry(innerPath) {
      return filesByPath.get(normalizeArchiveInnerPath(innerPath));
    },
    bytesFor(entry) {
      return data.slice(entry.body_offset, entry.body_offset + entry.size);
    },
  };
};

export const archiveKind = (path) => {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tar")) return "tar";
  if (lower.endsWith(".tgz") || lower.endsWith(".tar.gz")) return "tgz";
  return "";
};

export const canReadArchive = (path) => !!archiveKind(path);

export const parseArchive = (bytes, path, options = {}) => {
  const kind = archiveKind(path);
  if (kind === "zip") return parseZipArchive(bytes, options);
  if (kind === "tar") return parseTarArchive(bytes, options);
  if (kind === "tgz") return parseTarArchive(bytes, { ...options, gzip: true });
  throw new Error("archive preview is not implemented in the SiYuan kernel port yet");
};

export const parseZipArchive = (bytes, options = {}) => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const total = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const centralOffsetBase = Number(options.centralOffsetBase || 0);
  let offset = options.forcedCentralOffset !== undefined ? Number(options.forcedCentralOffset || 0) : centralOffset - centralOffsetBase;
  const root = {
    name: "",
    is_dir: true,
    size: 0,
    modified: new Date(0).toISOString(),
    created: new Date(0).toISOString(),
    children: new Map(),
  };
  const files = [];
  const filesByPath = new Map();
  let encrypted = false;

  const ensureDir = (parts, modified) => {
    let current = root;
    for (const part of parts) {
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          is_dir: true,
          size: 0,
          modified,
          created: modified,
          children: new Map(),
        });
      }
      current = current.children.get(part);
    }
    return current;
  };

  for (let index = 0; index < total; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("invalid zip: central directory is corrupt");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const modTime = view.getUint16(offset + 12, true);
    const modDate = view.getUint16(offset + 14, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttrs = view.getUint32(offset + 38, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const rawName = decodeZipName(data.slice(nameStart, nameStart + nameLength), (flags & 0x800) !== 0, options.filenameDecoder);
    const cleanName = normalizeArchiveInnerPath(rawName);
    const modified = dosDateTimeToIso(modDate, modTime);
    const isDir = rawName.endsWith("/") || ((externalAttrs >>> 16) & 0o40000) === 0o40000;
    encrypted = encrypted || (flags & 1) === 1;
    if (cleanName) {
      const parts = cleanName.split("/");
      const name = parts.pop();
      const parent = ensureDir(parts, modified);
      if (isDir) {
        ensureDir([...parts, name], modified);
      } else if (!parent.children.has(name)) {
        const node = {
          name,
          is_dir: false,
          size: uncompressedSize,
          modified,
          created: modified,
          archive_path: [...parts, name].join("/"),
          compressed_size: compressedSize,
          encrypted: (flags & 1) === 1,
          local_header_offset: localHeaderOffset,
          method,
        };
        parent.children.set(name, node);
        files.push(node);
        filesByPath.set(node.archive_path, node);
      }
    }
    offset = nameStart + nameLength + extraLength + commentLength;
  }

  return {
    comment: decodeZipName(data.slice(eocdOffset + 22, eocdOffset + 22 + view.getUint16(eocdOffset + 20, true)), true, options.filenameDecoder),
    encrypted,
    eocd_offset: eocdOffset,
    files,
    tree: sortNodes([...root.children.values()]).map(nodeToContent),
    list(innerPath = "/") {
      const parts = normalizeArchiveInnerPath(innerPath).split("/").filter(Boolean);
      let current = root;
      for (const part of parts) {
        current = current.children.get(part);
        if (!current || !current.is_dir) return [];
      }
      return sortNodes([...current.children.values()]).map(toArchiveObjResp);
    },
    file_count: files.length,
    entry(innerPath) {
      return filesByPath.get(normalizeArchiveInnerPath(innerPath));
    },
  };
};

const parseContentRangeSize = (value) => {
  const match = String(value || "").match(/\/(\d+|\*)\s*$/);
  return match && match[1] !== "*" ? Number(match[1]) : 0;
};

const headerValue = (headers = {}, name) => {
  const target = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

export const parseZipArchiveAsync = async (reader, options = {}) => {
  if (!reader?.rangeRead) throw new Error("archive reader is not seekable");
  let size = Number(reader.size || 0);
  let tailStart = 0;
  if (size > 0) {
    tailStart = Math.max(0, size - 65557);
  } else {
    tailStart = Math.max(0, Number(options.probeSize || 1048576) - 65557);
  }
  let tail = await reader.rangeRead(tailStart, size > 0 ? size - 1 : undefined);
  if (!size) {
    size = parseContentRangeSize(headerValue(tail.headers, "Content-Range")) || Number(headerValue(tail.headers, "Content-Length")) || tail.bytes.byteLength;
    tailStart = Math.max(0, size - tail.bytes.byteLength);
  }
  const view = new DataView(tail.bytes.buffer, tail.bytes.byteOffset, tail.bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const commentLength = view.getUint16(eocdOffset + 20, true);
  const eocdBytes = tail.bytes.slice(eocdOffset, eocdOffset + 22 + commentLength);
  const centralInTail = centralOffset >= tailStart && centralOffset + centralSize <= tailStart + tail.bytes.byteLength;
  if (centralInTail) {
    return parseZipArchive(tail.bytes, {
      ...options,
      centralOffsetBase: tailStart,
    });
  }
  const central = await reader.rangeRead(centralOffset, centralOffset + centralSize - 1);
  const merged = new Uint8Array(central.bytes.byteLength + eocdBytes.byteLength);
  merged.set(central.bytes, 0);
  merged.set(eocdBytes, central.bytes.byteLength);
  const archive = parseZipArchive(merged, {
    ...options,
    centralOffsetBase: centralOffset,
    forcedCentralOffset: 0,
  });
  return archive;
};

export const extractZipArchiveEntryReaderAsync = async (reader, innerPath, options = {}) => {
  if (!reader?.rangeRead) throw new Error("archive reader is not seekable");
  const archive = options.archive || await parseZipArchiveAsync(reader, options);
  const entry = archive.entry(innerPath);
  if (!entry) throw new Error("archive inner object not found");
  if (entry.encrypted) throw new Error("wrong archive password");
  const header = await reader.rangeRead(entry.local_header_offset, entry.local_header_offset + 29);
  const view = new DataView(header.bytes.buffer, header.bytes.byteOffset, header.bytes.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) throw new Error("invalid zip: local file header is corrupt");
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const dataStart = entry.local_header_offset + 30 + nameLength + extraLength;
  const compressed = entry.compressed_size > 0
    ? (await reader.rangeRead(dataStart, dataStart + entry.compressed_size - 1)).bytes
    : new Uint8Array();
  if (entry.method === 0) {
    return {
      bytes: compressed,
      entry,
    };
  }
  if (entry.method === 8) {
    return {
      bytes: inflateSync(compressed),
      entry,
    };
  }
  throw new Error(`zip compression method ${entry.method} is not supported yet`);
};

export const extractZipArchiveEntry = (bytes, innerPath, options = {}) => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const archive = options.archive || parseZipArchive(data, options);
  const entry = archive.entry(innerPath);
  if (!entry) throw new Error("archive inner object not found");
  if (entry.encrypted) throw new Error("encrypted archive entry is not implemented in the SiYuan kernel port yet");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const offset = entry.local_header_offset;
  if (view.getUint32(offset, true) !== 0x04034b50) throw new Error("invalid zip: local file header is corrupt");
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = data.slice(dataStart, dataStart + entry.compressed_size);
  if (entry.method === 0) {
    return {
      bytes: compressed,
      entry,
    };
  }
  if (entry.method === 8) {
    return {
      bytes: inflateSync(compressed),
      entry,
    };
  }
  throw new Error(`zip compression method ${entry.method} is not supported yet`);
};

export const extractZipArchiveEntryAsync = async (bytes, innerPath, options = {}) => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const archive = options.archive || parseZipArchive(data, options);
  const entry = archive.entry(innerPath);
  if (!entry) throw new Error("archive inner object not found");
  if (!entry.encrypted) return extractZipArchiveEntry(data, innerPath, { ...options, archive });
  throw new Error("wrong archive password");
};

export const extractZipArchiveEntries = (bytes, options = {}) => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const archive = parseZipArchive(data, options);
  const inner = normalizeArchiveInnerPath(options.innerPath || "");
  const prefix = inner ? `${inner}/` : "";
  const paths = [];
  for (const file of archive.files) {
    if (!inner || file.archive_path === inner || file.archive_path.startsWith(prefix)) paths.push(file.archive_path);
  }
  if (inner && !paths.length) throw new Error("archive inner object not found");
  return paths.map((path) => extractZipArchiveEntry(data, path, { ...options, archive }));
};

export const extractArchiveEntry = (bytes, path, innerPath, options = {}) => {
  const kind = archiveKind(path);
  if (kind === "zip") return extractZipArchiveEntry(bytes, innerPath, options);
  const archive = options.archive || parseArchive(bytes, path, options);
  const entry = archive.entry(innerPath);
  if (!entry) throw new Error("archive inner object not found");
  return {
    bytes: archive.bytesFor(entry),
    entry,
  };
};

export const extractArchiveEntryAsync = async (bytes, path, innerPath, options = {}) => {
  const kind = archiveKind(path);
  if (kind === "zip") return extractZipArchiveEntryAsync(bytes, innerPath, options);
  return extractArchiveEntry(bytes, path, innerPath, options);
};

export const extractArchiveEntries = (bytes, path, options = {}) => {
  const archive = parseArchive(bytes, path, options);
  const inner = normalizeArchiveInnerPath(options.innerPath || "");
  const prefix = inner ? `${inner}/` : "";
  const paths = [];
  for (const file of archive.files) {
    if (!inner || file.archive_path === inner || file.archive_path.startsWith(prefix)) paths.push(file.archive_path);
  }
  if (inner && !paths.length) throw new Error("archive inner object not found");
  return paths.map((innerPath) => extractArchiveEntry(bytes, path, innerPath, { ...options, archive }));
};

export const extractArchiveEntriesAsync = async (bytes, path, options = {}) => {
  const archive = parseArchive(bytes, path, options);
  const inner = normalizeArchiveInnerPath(options.innerPath || "");
  const prefix = inner ? `${inner}/` : "";
  const paths = [];
  for (const file of archive.files) {
    if (!inner || file.archive_path === inner || file.archive_path.startsWith(prefix)) paths.push(file.archive_path);
  }
  if (inner && !paths.length) throw new Error("archive inner object not found");
  return Promise.all(paths.map((innerPath) => extractArchiveEntryAsync(bytes, path, innerPath, { ...options, archive })));
};

export const archiveNotImplemented = (operation) => ({
  operation,
  reason: "SiYuan kernel JavaScript runtime has no archive reader wired yet.",
  upstream_source: "server/handles/archive.go + internal/op/archive.go + internal/archive/*",
  next: "Port a JS archive reader or expose a kernel-side archive primitive before enabling this route.",
});

export const sharingArchiveNotImplemented = (operation) => ({
  operation,
  reason: "SiYuan kernel JavaScript runtime has no sharing archive reader wired yet.",
  upstream_source: "server/handles/sharing.go + internal/sharing/archive.go",
  next: "Port OpenList sharing archive preview/extract before enabling this route.",
});
