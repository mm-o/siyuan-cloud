import { archiveNotImplemented, sharingArchiveNotImplemented } from "../../internal/fs/archive.js";
import { failure, jsonResponse } from "../common/response.js";

const parseArchiveRequest = async (request, parseJson) => {
  if (request.method === "GET" || request.method === "HEAD")
    return Object.fromEntries(new URL(request.url).searchParams.entries());
  return parseJson(request);
};

const isSharingArchivePath = (path) => typeof path === "string" && path.startsWith("/@s");

export const createArchiveHandlers = ({ parseJson, taskStore }) => ({
  "ANY /api/fs/archive/meta": async (request) => {
    const req = await parseArchiveRequest(request, parseJson);
    const data = isSharingArchivePath(req.path)
      ? sharingArchiveNotImplemented("share_meta")
      : archiveNotImplemented("meta");
    return jsonResponse(failure(
      "archive preview is not implemented in the SiYuan kernel port yet",
      501,
      data,
    ), 501);
  },
  "ANY /api/fs/archive/list": async (request) => {
    const req = await parseArchiveRequest(request, parseJson);
    const data = isSharingArchivePath(req.path)
      ? sharingArchiveNotImplemented("share_list")
      : archiveNotImplemented("list");
    return jsonResponse(failure(
      "archive preview is not implemented in the SiYuan kernel port yet",
      501,
      data,
    ), 501);
  },
  "POST /api/fs/archive/decompress": async (request) => {
    const req = await parseJson(request);
    const task = await taskStore.addTask("decompress", {
      error: "archive decompress is not implemented in the SiYuan kernel port yet",
      name: req.src_path || req.path || "archive decompress",
      status: "not implemented",
    });
    return jsonResponse(failure(
      "archive decompress is not implemented in the SiYuan kernel port yet",
      501,
      { ...archiveNotImplemented("decompress"), task },
    ), 501);
  },
});
