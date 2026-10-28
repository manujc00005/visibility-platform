import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { setLocaleAction } = await import("@/i18n/actions");

function form(value?: string): FormData {
  const data = new FormData();
  if (value !== undefined) data.set("locale", value);
  return data;
}

describe("setLocaleAction", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    cookieSet.mockClear();
    revalidatePath.mockClear();
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalEnv ?? "test");
  });

  it("writes the cookie with the SPEC attributes and revalidates the layout", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setLocaleAction(form("en"));
    expect(cookieSet).toHaveBeenCalledTimes(1);
    expect(cookieSet).toHaveBeenCalledWith({
      name: "locale",
      value: "en",
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: false,
      maxAge: 31_536_000,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("marks the cookie Secure only in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setLocaleAction(form("es"));
    expect(cookieSet).toHaveBeenCalledWith(expect.objectContaining({ value: "es", secure: true }));
  });

  it("ignores unsupported or missing values without writing or revalidating", async () => {
    await setLocaleAction(form("xx"));
    await setLocaleAction(form("EN"));
    await setLocaleAction(form());
    expect(cookieSet).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
