/**
 * @vitest-environment node
 *
 * The `login` Server Action's branches, with the database and the redirect
 * mocked out. This is the one place the app decides what a visitor is told
 * about a failed sign-in, so each branch is pinned down explicitly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticate = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    // The real `redirect()` signals by throwing, and the action relies on
    // that to stop executing. Mocking it as a plain function would let the
    // action fall through and mask a bug, so the mock throws too.
    throw new Error(`REDIRECT:${path}`);
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/users", () => ({ authenticate }));
vi.mock("@/lib/auth/session", () => ({ createSession }));
vi.mock("next/navigation", () => ({ redirect }));

const { login } = await import("@/lib/auth/actions");
const { EMPTY_LOGIN_STATE } = await import("@/lib/auth/login-state");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const GOOD_USER = { _id: "507f1f77bcf86cd799439011" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validation", () => {
  it("asks for an email when it is missing", async () => {
    const state = await login(EMPTY_LOGIN_STATE, form({ password: "birchfam" }));
    expect(state.error).toMatch(/email/i);
    // Nothing should have reached the database.
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("asks for a password when it is missing", async () => {
    const state = await login(EMPTY_LOGIN_STATE, form({ email: "birchfam" }));
    expect(state.error).toMatch(/password/i);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("rejects a password longer than bcrypt reads, rather than truncating it", async () => {
    const state = await login(
      EMPTY_LOGIN_STATE,
      form({ email: "birchfam", password: "a".repeat(73) }),
    );
    expect(state.error).toMatch(/72/);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("rejects an absurdly long email without hitting the database", async () => {
    const state = await login(
      EMPTY_LOGIN_STATE,
      form({ email: "a".repeat(201), password: "birchfam" }),
    );
    expect(state.error).toMatch(/too long/i);
    expect(authenticate).not.toHaveBeenCalled();
  });
});

describe("failed sign-in", () => {
  it("gives the same message for an unknown email and a wrong password", async () => {
    /*
     * This is the whole point: if the two differed, anyone could discover
     * which email addresses have accounts by reading the error text.
     */
    authenticate.mockResolvedValue(null);

    const unknown = await login(
      EMPTY_LOGIN_STATE,
      form({ email: "nobody", password: "birchfam" }),
    );
    const wrongPassword = await login(
      EMPTY_LOGIN_STATE,
      form({ email: "birchfam", password: "wrong" }),
    );

    expect(unknown.error).toBe(wrongPassword.error);
    expect(unknown.error).toMatch(/do not match/i);
  });

  it("puts the email back in the field so it does not have to be retyped", async () => {
    authenticate.mockResolvedValue(null);
    const state = await login(
      EMPTY_LOGIN_STATE,
      form({ email: "birchfam", password: "wrong" }),
    );
    expect(state.email).toBe("birchfam");
  });

  it("never echoes the password back", async () => {
    authenticate.mockResolvedValue(null);
    const state = await login(
      EMPTY_LOGIN_STATE,
      form({ email: "birchfam", password: "hunter2" }),
    );
    expect(JSON.stringify(state)).not.toContain("hunter2");
  });

  it("does not start a session", async () => {
    authenticate.mockResolvedValue(null);
    await login(EMPTY_LOGIN_STATE, form({ email: "birchfam", password: "x" }));
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("database unreachable", () => {
  it("says so, instead of blaming the password", async () => {
    /*
     * The failure mode this covers is a real one: Atlas rejects connections
     * from non-allowlisted IPs, and telling the user "wrong password" when the
     * cluster is simply unreachable sends them chasing the wrong problem.
     */
    authenticate.mockRejectedValue(
      new Error("tlsv1 alert internal error"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await login(
      EMPTY_LOGIN_STATE,
      form({ email: "birchfam", password: "birchfam" }),
    );

    expect(state.error).toMatch(/could not reach the database/i);
    expect(state.error).not.toMatch(/do not match/i);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("does not leak the connection string or driver internals to the browser", async () => {
    authenticate.mockRejectedValue(
      new Error("failed to connect to mongodb+srv://user:hunter2@cluster0.example.net"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await login(
      EMPTY_LOGIN_STATE,
      form({ email: "birchfam", password: "birchfam" }),
    );

    expect(state.error).not.toContain("mongodb+srv");
    expect(state.error).not.toContain("hunter2");
  });
});

describe("successful sign-in", () => {
  it("starts a session and redirects to the dashboard", async () => {
    authenticate.mockResolvedValue(GOOD_USER);

    await expect(
      login(EMPTY_LOGIN_STATE, form({ email: "birchfam", password: "birchfam" })),
    ).rejects.toThrow("REDIRECT:/");

    expect(createSession).toHaveBeenCalledWith(GOOD_USER._id);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("normalises the email before looking it up", async () => {
    authenticate.mockResolvedValue(GOOD_USER);

    await expect(
      login(EMPTY_LOGIN_STATE, form({ email: "  BirchFam  ", password: "birchfam" })),
    ).rejects.toThrow("REDIRECT:/");

    // Trimmed by the schema; the lowercasing happens in the data layer.
    expect(authenticate).toHaveBeenCalledWith("BirchFam", "birchfam");
  });
});
