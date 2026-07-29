import { defineApiAuthManifest } from "@templar/api-auth";

export const apiAuthManifest = defineApiAuthManifest({
  audience: "your-shopper:web",
  keyPrefix: "ys_live_",
  permissions: {
    runs: ["create"],
  },
  keys: {
    defaultExpiresInDays: 90,
    maximumExpiresInDays: 365,
    maximumActivePerUser: 10,
  },
});
