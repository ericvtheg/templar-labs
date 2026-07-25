import {
  createTemplarAuthApp,
  type TemplarAuthApp,
  type TemplarAuthAppConfig,
} from "@templar/auth/app";
import { makeDatabase } from "@templar/db";
import { Effect } from "effect";
import { usersSchema } from "./schema.ts";
import { makeD1UsersStore, makeUsersService, type UsersService } from "./service.ts";

export type TemplarUserAppConfig = Omit<TemplarAuthAppConfig, "integration"> & {
  readonly db: D1Database;
  readonly nowDate?: () => Date;
};

export type TemplarUserApp = TemplarAuthApp & {
  readonly users: UsersService;
};

export function createTemplarUserApp(config: TemplarUserAppConfig): TemplarUserApp {
  const database = makeDatabase(config.db, { schema: usersSchema });
  const store = makeD1UsersStore(database.db);
  const nowInput = config.nowDate === undefined ? {} : { now: config.nowDate };

  const app = createTemplarAuthApp({
    ...config,
    integration: {
      onAuthenticated: async ({ request, auth }) => {
        const callbackUsers = makeUsersService({ auth, store, ...nowInput });
        await Effect.runPromise(callbackUsers.ensureUser(request));
      },
    },
  });

  const users = makeUsersService({
    auth: app.auth,
    store,
    ...nowInput,
  });

  return { ...app, users };
}
