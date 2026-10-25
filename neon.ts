import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  auth: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (branch.name === "dev" || branch.name === "test") {
      // Long-lived development and integration-test branches: no TTL, so `neon checkout dev --create`
      // never gives it an expiry. Omitting `ttl` does not clear an expiry that an
      // existing branch already has; that is removed with
      // `neon branches set-expiration dev` (no --expires-at).
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
