import { readdir } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, users } from "@/lib/db/schema";
import {
  MAX_IMAGE_BYTES,
  isUploadUrl,
  keyBelongsToOrganization,
  publicUrlFor,
  putImage,
  readImage,
  resolveKeyPath,
  sniffImageType,
  uploadRoot,
} from "@/lib/storage";
import { saveUploadedImage, setOrganizationLogo, setUserAvatar } from "@/services/uploads";
import { imageRefSchema } from "@/lib/validation";
import { GET as serveUpload } from "@/app/api/uploads/[...key]/route";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";

/* ------------------------------------------------------------- fixtures --- */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Builds a buffer with a real image signature and `size` total bytes. */
function imageBytes(kind: "png" | "jpg" | "webp" | "gif", size = 256): Buffer {
  const buffer = Buffer.alloc(size, 0x20);
  if (kind === "png") {
    PNG_MAGIC.copy(buffer);
  } else if (kind === "jpg") {
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(buffer);
  } else if (kind === "webp") {
    buffer.write("RIFF", 0, "ascii");
    buffer.write("WEBP", 8, "ascii");
  } else {
    buffer.write("GIF89a", 0, "ascii");
  }
  return buffer;
}

function fileFrom(bytes: Buffer, name: string, type = "image/png"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

/* ----------------------------------------------------------------- tests --- */

describe("image sniffing", () => {
  it("recognises the four supported formats from their magic bytes", () => {
    expect(sniffImageType(imageBytes("png"))).toBe("png");
    expect(sniffImageType(imageBytes("jpg"))).toBe("jpg");
    expect(sniffImageType(imageBytes("webp"))).toBe("webp");
    expect(sniffImageType(imageBytes("gif"))).toBe("gif");
  });

  it("rejects payloads that are not images, whatever they claim to be", () => {
    expect(sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImageType(Buffer.from("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(Buffer.from("not an image at all"))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("content-addressed storage", () => {
  it("stores an image under its organization and returns a public URL", async () => {
    const orgId = crypto.randomUUID();
    const stored = await putImage({ organizationId: orgId, kind: "product", bytes: imageBytes("png") });

    expect(stored.key).toMatch(
      new RegExp(`^${orgId}/product/[a-f0-9]{64}\\.png$`),
    );
    expect(stored.url).toBe(`/api/uploads/${stored.key}`);
    expect(stored.contentType).toBe("image/png");
    expect(isUploadUrl(stored.url)).toBe(true);

    const roundTripped = await readImage(stored.key);
    expect(roundTripped?.contentType).toBe("image/png");
    expect(roundTripped?.bytes.equals(imageBytes("png"))).toBe(true);
  });

  it("deduplicates identical bytes and writes one file", async () => {
    const orgId = crypto.randomUUID();
    const first = await putImage({ organizationId: orgId, kind: "logo", bytes: imageBytes("jpg") });
    const second = await putImage({ organizationId: orgId, kind: "logo", bytes: imageBytes("jpg") });
    expect(second.key).toBe(first.key);

    const entries = await readdir(path.join(uploadRoot(), orgId, "logo"));
    expect(entries).toEqual([`${first.sha256}.jpg`]);
  });

  it("rejects empty, oversized and non-image files", async () => {
    const organizationId = crypto.randomUUID();
    await expect(putImage({ organizationId, kind: "product", bytes: Buffer.alloc(0) })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "The selected file is empty",
    });
    await expect(
      putImage({ organizationId, kind: "product", bytes: Buffer.concat([imageBytes("png"), Buffer.alloc(MAX_IMAGE_BYTES)]) }),
    ).rejects.toMatchObject({ message: "Images must be 4 MB or smaller" });
    await expect(
      putImage({ organizationId, kind: "product", bytes: Buffer.from("<html>hi</html>") }),
    ).rejects.toMatchObject({ message: "Upload a PNG, JPEG, WebP or GIF image" });
  });

  it("refuses a caller-supplied organization id that is not a UUID", async () => {
    await expect(
      putImage({ organizationId: "../../etc", kind: "product", bytes: imageBytes("png") }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("cannot read outside the upload root", async () => {
    expect(await readImage("../../etc/passwd")).toBeNull();
    expect(await readImage(`${crypto.randomUUID()}/product/${"a".repeat(64)}.png`)).toBeNull();
    expect(() => resolveKeyPath("../../etc/passwd")).toThrow();
    expect(() => resolveKeyPath(`${crypto.randomUUID()}/../product/${"a".repeat(64)}.png`)).toThrow();
  });

  it("scopes keys to the organization that created them", async () => {
    const orgId = crypto.randomUUID();
    const other = crypto.randomUUID();
    const stored = await putImage({ organizationId: orgId, kind: "avatar", bytes: imageBytes("webp") });
    expect(keyBelongsToOrganization(stored.key, orgId)).toBe(true);
    expect(keyBelongsToOrganization(stored.key, other)).toBe(false);
    expect(keyBelongsToOrganization("../../etc/passwd", orgId)).toBe(false);
  });
});

describe("image reference validation", () => {
  it("accepts uploaded paths and absolute URLs, rejects other same-origin paths", () => {
    const key = `${crypto.randomUUID()}/product/${"b".repeat(64)}.png`;
    expect(imageRefSchema.parse(publicUrlFor(key))).toBe(publicUrlFor(key));
    expect(imageRefSchema.parse("https://cdn.example.test/photo.png")).toBe(
      "https://cdn.example.test/photo.png",
    );
    expect(imageRefSchema.parse("")).toBeNull();
    expect(() => imageRefSchema.parse("/dashboard/settings")).toThrow();
    expect(() => imageRefSchema.parse("/api/uploads/../../etc/passwd")).toThrow();
    expect(() => imageRefSchema.parse("javascript:alert(1)")).toThrow();
  });
});

describe("upload service", () => {
  it("stores a File from a form and rejects an oversized one by its declared size", async () => {
    const orgId = crypto.randomUUID();
    const stored = await saveUploadedImage({
      organizationId: orgId,
      kind: "logo",
      file: fileFrom(imageBytes("gif"), "logo.gif", "image/gif"),
    });
    expect(stored.contentType).toBe("image/gif");
    expect((await readImage(stored.key))?.bytes.length).toBe(256);

    const oversized = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.png", { type: "image/png" });
    await expect(
      saveUploadedImage({ organizationId: orgId, kind: "logo", file: oversized }),
    ).rejects.toMatchObject({ message: "Images must be 4 MB or smaller" });
  });

  it("ignores the client's declared content type and trusts the bytes", async () => {
    const orgId = crypto.randomUUID();
    const stored = await saveUploadedImage({
      organizationId: orgId,
      kind: "product",
      // Browser says PNG; bytes are actually a JPEG.
      file: fileFrom(imageBytes("jpg"), "photo.png", "image/png"),
    });
    expect(stored.extension).toBe("jpg");
    expect(stored.contentType).toBe("image/jpeg");
  });

  it("persists the logo on the organization and the avatar on the user", async () => {
    const user = await makeUser();
    const org = await makeOrganization(user);
    const logo = await putImage({ organizationId: org.id, kind: "logo", bytes: imageBytes("png") });
    const avatar = await putImage({ organizationId: org.id, kind: "avatar", bytes: imageBytes("png") });

    await setOrganizationLogo({
      organizationId: org.id,
      actor: { id: user.id, email: user.email },
      logoUrl: logo.url,
    });
    await setUserAvatar({ userId: user.id, avatarUrl: avatar.url });

    const [storedOrg] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    const [storedUser] = await db.select().from(users).where(eq(users.id, user.id));
    expect(storedOrg!.logoUrl).toBe(logo.url);
    expect(storedUser!.avatarUrl).toBe(avatar.url);

    await setOrganizationLogo({
      organizationId: org.id,
      actor: { id: user.id, email: user.email },
      logoUrl: null,
    });
    const [cleared] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(cleared!.logoUrl).toBeNull();
  });
});

describe("image serving route", () => {
  it("serves the stored bytes with a locked-down content type", async () => {
    const orgId = crypto.randomUUID();
    const stored = await putImage({ organizationId: orgId, kind: "product", bytes: imageBytes("png") });

    const response = await serveUpload(new Request(`http://localhost:3000${stored.url}`), {
      params: Promise.resolve({ key: stored.key.split("/") }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("immutable");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.length).toBe(stored.bytes);
  });

  it("returns 404 for unknown and malformed keys", async () => {
    for (const key of [
      ["../../etc", "passwd"],
      [crypto.randomUUID(), "product", `${"c".repeat(64)}.png`],
      [],
    ]) {
      const response = await serveUpload(new Request("http://localhost:3000/api/uploads"), {
        params: Promise.resolve({ key }),
      });
      expect(response.status).toBe(404);
    }
  });
});
