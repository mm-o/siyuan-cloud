import { failure, jsonResponse, success } from "../common/response.js";

export const createIndexHandlers = ({
  parseJson,
  searchIndex,
}) => {
  return {
    "POST /api/admin/index/build": async () => {
      await searchIndex.clear();
      await searchIndex.build({ clearFirst: true, count: true, paths: ["/"] });
      return jsonResponse(success());
    },
    "POST /api/admin/index/update": async (request) => {
      const req = await parseJson(request);
      const paths = Array.isArray(req.paths) && req.paths.length ? req.paths : ["/"];
      await searchIndex.build({ clearFirst: false, count: false, maxDepth: req.max_depth, paths });
      return jsonResponse(success());
    },
    "POST /api/admin/index/stop": async () => jsonResponse(failure("index is not running", 400)),
    "POST /api/admin/index/clear": async () => {
      await searchIndex.clear();
      await searchIndex.writeProgress({
        error: "",
        is_done: true,
        last_done_time: null,
        obj_count: 0,
      });
      return jsonResponse(success());
    },
    "GET /api/admin/index/progress": async () => {
      return jsonResponse(success(searchIndex.getProgress()));
    },
  };
};
