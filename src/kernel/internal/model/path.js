export const normalizePath = (input) => {
  let value = typeof input === "string" && input.trim() ? input.trim() : "/"
  if (!value.startsWith("/")) value = "/" + value
  value = value.replace(/\\/g, "/").replace(/\/+/g, "/")
  const parts = []
  for (const part of value.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") continue
    parts.push(part)
  }
  return "/" + parts.join("/")
}

export const dirname = (path) => {
  const normalized = normalizePath(path)
  if (normalized === "/") return "/"
  const index = normalized.lastIndexOf("/")
  return index <= 0 ? "/" : normalized.slice(0, index)
}

export const basename = (path) => {
  const normalized = normalizePath(path)
  if (normalized === "/") return ""
  return normalized.slice(normalized.lastIndexOf("/") + 1)
}

export const isSafeRelativeName = (name) => {
  const value = String(name || "").trim()
  return !!value && !/[\\/]/.test(value) && value !== "." && value !== ".."
}
