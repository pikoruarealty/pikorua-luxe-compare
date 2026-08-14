import { beforeEach, describe, expect, it, vi } from "vitest";

let ownedJob = false;

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const builder = {
      middleware() {
        return builder;
      },
      inputValidator(fn: (input: unknown) => unknown) {
        validate = fn;
        return builder;
      },
      handler(fn: (ctx: { data: unknown; context: { adminProfile: { id: string } } }) => unknown) {
        return async (args?: { data?: unknown }) =>
          fn({ data: validate(args?.data), context: { adminProfile: { id: "admin-1" } } });
      },
    };
    return builder;
  },
}));

vi.mock("@/integrations/supabase/admin-auth-middleware", () => ({ requireAdminAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: ownedJob ? { job_id: "job-1234" } : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  },
}));

async function call(fn: unknown, data: unknown) {
  return (fn as (args: { data: unknown }) => Promise<unknown>)({ data });
}

describe("brochure job ownership", () => {
  beforeEach(() => {
    ownedJob = false;
    vi.stubEnv("BROCHURE_EXTRACTOR_URL", "https://ocr.example.com");
    vi.stubEnv("BROCHURE_EXTRACTOR_API_KEY", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "processing", batches_done: 1, batches_total: 2 }),
      })),
    );
  });

  it("refuses progress for a job that belongs to another admin", async () => {
    const { getBrochureExtractionProgress } = await import("./brochure-extract.functions");
    await expect(call(getBrochureExtractionProgress, { jobId: "job-1234" })).rejects.toThrow(
      /job|access|belong/i,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
