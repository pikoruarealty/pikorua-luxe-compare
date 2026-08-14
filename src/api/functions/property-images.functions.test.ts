import { beforeEach, describe, expect, it, vi } from "vitest";

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
      handler(fn: (ctx: { data: unknown }) => unknown) {
        return async (args?: { data?: unknown }) => fn({ data: validate(args?.data) });
      },
    };
    return builder;
  },
}));

vi.mock("@/integrations/supabase/admin-auth-middleware", () => ({ requireAdminAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://images.example/upload.jpg" } }),
      }),
    },
  },
}));

async function call(data: Record<string, unknown>) {
  const { uploadPropertyImage } = await import("./property-images.functions");
  return (uploadPropertyImage as unknown as (args: { data: unknown }) => Promise<unknown>)({
    data,
  });
}

describe("property image validation", () => {
  beforeEach(() => vi.stubEnv("MAX_IMAGE_UPLOAD_BYTES", "10"));

  it("rejects bytes that do not match the claimed image type", async () => {
    await expect(
      call({
        folder: "property",
        slot: "cover",
        fileName: "fake.jpg",
        contentType: "image/jpeg",
        fileBase64: Buffer.from("<script>alert(1)</script>").toString("base64"),
      }),
    ).rejects.toThrow(/content|type|image/i);
  });

  it("honours the environment-driven decoded-byte limit", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(
      call({
        folder: "property",
        slot: "cover",
        fileName: "large.jpg",
        contentType: "image/jpeg",
        fileBase64: jpeg.toString("base64"),
      }),
    ).rejects.toThrow(/large|max/i);
  });
});
