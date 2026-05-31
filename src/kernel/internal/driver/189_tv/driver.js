import { create189SessionDriver } from "./session.js";

export const create189CloudTVDriver = ({ client }) => create189SessionDriver({
  client,
  mode: "tv",
  provider: "189CloudTV",
});
