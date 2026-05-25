import { archiveNotImplemented } from "../../internal/fs/archive.js";
import { failure, jsonResponse } from "../common/response.js";

export const createArchiveHandlers = ({ parseJson, taskStore }) => ({
  "ANY /api/fs/archive/meta": async () => jsonResponse(failure(
    "archive preview is not implemented in the SiYuan kernel port yet",
    501,
    archiveNotImplemented("meta"),
  ), 501),
  "ANY /api/fs/archive/list": async () => jsonResponse(failure(
    "archive preview is not implemented in the SiYuan kernel port yet",
    501,
    archiveNotImplemented("list"),
  ), 501),
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
