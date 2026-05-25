export const linkFromDriverData = (data = {}) => {
  const link = data.link || data.Link || {};
  const url = link.url || link.URL || data.proxy_url || data.proxyUrl || data.redirect_url || data.redirectUrl || "";
  const header = link.header || link.Header || data.proxy_headers || data.proxyHeaders || data.headers || {};
  return {
    url,
    header,
    method: link.method || link.Method || data.proxy_method || data.proxyMethod || "GET",
    content_length: Number(link.content_length || link.ContentLength || data.content_length || data.contentLength || 0),
    concurrency: Number(link.concurrency || link.Concurrency || data.concurrency || 0),
    part_size: Number(link.part_size || link.PartSize || data.part_size || data.partSize || 0),
    range_reader: link.range_reader || link.RangeReader || null,
  };
};

