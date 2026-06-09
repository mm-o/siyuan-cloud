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
