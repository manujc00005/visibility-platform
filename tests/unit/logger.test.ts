import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "@/lib/logger";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, destination };
}

describe("logger", () => {
  it("writes structured JSON with the service name", () => {
    const { lines, destination } = capture();
    createLogger({ level: "info", destination }).info({ jobId: "j1" }, "hello");
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ service: "visibility-platform", jobId: "j1", msg: "hello" });
  });

  it("redacts credentials and cookies", () => {
    const { lines, destination } = capture();
    createLogger({ level: "info", destination }).info(
      {
        password: "s3cret",
        headers: { authorization: "Bearer abc", cookie: "session=xyz" },
        user: { token: "t0k" },
        DATABASE_URL: "postgresql://u:p@host/db",
      },
      "request",
    );
    const raw = lines[0]!;
    for (const secret of ["s3cret", "Bearer abc", "session=xyz", "t0k", "u:p@host"]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).toContain("[REDACTED]");
  });

  it("redacts the Bing Webmaster API key", () => {
    const { lines, destination } = capture();
    createLogger({ level: "info", destination }).info(
      { apikey: "BINGKEY0123456789", params: { apikey: "BINGKEY9876543210" }, BING_WEBMASTER_API_KEY: "BINGKEYENV0123456" },
      "bing",
    );
    const raw = lines[0]!;
    for (const secret of ["BINGKEY0123456789", "BINGKEY9876543210", "BINGKEYENV0123456"]) {
      expect(raw).not.toContain(secret);
    }
  });
});
