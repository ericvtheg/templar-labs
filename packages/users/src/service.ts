import type { AuthService } from "@templar/auth";
import { Auth, type AuthUnauthorizedError } from "@templar/auth";
import { type D1DatabaseClient, Database } from "@templar/db";
import { Context, Effect, Layer } from "effect";
import { UsersStorageError } from "./errors.ts";
import { type AppUser, appUsers, type UsersSchema } from "./schema.ts";

export type UsersStore = {
  readonly ensure: (userId: string, seenAt: Date) => Promise<AppUser>;
};

export type UsersService = {
  readonly ensureUser: (
    request: Request,
  ) => Effect.Effect<AppUser, AuthUnauthorizedError | UsersStorageError>;
};

export class Users extends Context.Tag("@templar/users/Users")<Users, UsersService>() {
  static readonly ensureUser = Effect.serviceFunctionEffect(this, (users) => users.ensureUser);
}

export function makeUsersService(input: {
  readonly auth: AuthService;
  readonly store: UsersStore;
  readonly now?: () => Date;
}): UsersService {
  const now = input.now ?? (() => new Date());

  return {
    ensureUser: (request) =>
      Effect.flatMap(input.auth.requireUser(request), (user) =>
        Effect.tryPromise({
          try: () => input.store.ensure(user.id, now()),
          catch: (cause) => new UsersStorageError({ operation: "ensure-user", cause }),
        }),
      ),
  };
}

export function makeD1UsersStore(db: D1DatabaseClient<UsersSchema>): UsersStore {
  return {
    ensure: async (userId, seenAt) =>
      db
        .insert(appUsers)
        .values({
          id: userId,
          createdAt: seenAt,
          lastSeenAt: seenAt,
        })
        .onConflictDoUpdate({
          target: appUsers.id,
          set: { lastSeenAt: seenAt },
        })
        .returning()
        .get(),
  };
}

export function makeUsersLayer(service: UsersService): Layer.Layer<Users> {
  return Layer.succeed(Users, service);
}

export function usersLayer(
  input: { readonly now?: () => Date } = {},
): Layer.Layer<Users, never, Auth | Database> {
  return Layer.effect(
    Users,
    Effect.gen(function* () {
      const auth = yield* Auth;
      const database = yield* Database;
      return makeUsersService({
        auth,
        store: makeD1UsersStore(database.db as D1DatabaseClient<UsersSchema>),
        ...(input.now === undefined ? {} : { now: input.now }),
      });
    }),
  );
}
