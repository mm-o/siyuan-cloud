export const acceptedArchiveExtensions = () => [
  "zip",
  "tar",
  "gz",
  "tgz",
  "7z",
  "rar",
  "iso",
];

export const archiveNotImplemented = (operation) => ({
  operation,
  reason: "SiYuan kernel JavaScript runtime has no archive reader wired yet.",
  upstream_source: "server/handles/archive.go + internal/op/archive.go + internal/archive/*",
  next: "Port a JS archive reader or expose a kernel-side archive primitive before enabling this route.",
});
