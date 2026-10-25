import { config } from "dotenv";

// Integration tests use only TEST_DATABASE_URL. DATABASE_URL (dev branch) is removed so no
// code path can fall back to it by accident.
config({ path: [".env.test.local"], quiet: true });
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_UNPOOLED;
process.env.LOG_LEVEL ??= "silent";
