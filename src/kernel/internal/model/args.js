export const linkFromDriverData = (data = {}) => {
  const link = data.link || {};
  if (!link.url) throw new Error("driver read did not return link.url");
  return {
    url: link.url,
    header: link.header || {},
    method: link.method || "GET",
    content_length: Number(link.content_length || 0),
    concurrency: Number(link.concurrency || 0),
    part_size: Number(link.part_size || 0),
    range_reader: link.range_reader || null,
  };
};
