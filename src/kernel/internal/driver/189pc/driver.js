import { create189SessionDriver } from "./session.js";

export const create189CloudPCDriver = ({ client }) => create189SessionDriver({
  client,
  mode: "pc",
  provider: "189CloudPC",
});
