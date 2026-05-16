import alchemy, { type AlchemyOptions } from "alchemy";
import { CloudflareStateStore } from "alchemy/state";

export type DeployAppOptions = Omit<AlchemyOptions, "appName">;

export async function deployApp(appName: string, options: DeployAppOptions = {}) {
  return await alchemy(appName, {
    stateStore: (scope) => new CloudflareStateStore(scope),
    ...options,
  });
}
