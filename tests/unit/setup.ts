// Unit tests never touch a database. Make sure no connection string leaks in.
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_UNPOOLED;
delete process.env.TEST_DATABASE_URL;
process.env.LOG_LEVEL ??= "silent";
