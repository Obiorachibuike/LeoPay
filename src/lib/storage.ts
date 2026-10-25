import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Local-disk object storage for merchant images (product photos, logos,
 * avatars).
 *
 * The design is deliberately driver-shaped: everything goes through
 * `putImage`/`readImage` and callers never touch the filesystem. Swapping this
 * for S3/R2 means reimplementing these two functions; see
 * docs/LIMITATIONS.md for what a production deployment must add (durable
 * volume or object storage, plus a CDN).
 *
 * Stored keys look like `<organizationId>/<kind>/<sha256>.<ext>`. They are
 * content-addressed, so re-uploading the same bytes is a no-op and a key can
 * never collide across tenants.
 */

export const IMAGE_CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
} as const;

export type ImageExtension = keyof typeof IMAGE_CONTENT_TYPES;
export type UploadKind = "product" | "logo" | "avatar";

/** 4 MiB: comfortably above a phone photo, small enough to store on disk. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const UPLOAD_KINDS: readonly UploadKind[] = ["product", "logo", "avatar"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^([0-9a-f-]{36})\/(product|logo|avatar)\/([a-f0-9]{64})\.(png|jpg|webp|gif)$/i;

export type StoredImage = {
  key: string;
  url: string;
  contentType: string;
  bytes: number;
  sha256: string;
  extension: ImageExtension;
};

/**
 * Identifies an image from its leading bytes. The browser-supplied MIME type
 * and filename are never trusted: an HTML or SVG payload renamed to `.png`
 * must be rejected, because it would otherwise be served from our origin.
 */
export function sniffImageType(buffer: Buffer): ImageExtension | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return "gif";
  }
  return null;
}

export function uploadRoot(): string {
  return path.resolve(env.uploadDir);
}

function assertSafeSegment(value: string, label: string) {
  if (!UUID_RE.test(value)) {
    throw new AppError("VALIDATION_ERROR", `${label} is not a valid identifier`);
  }
}

/** Resolves a storage key to an absolute path, refusing anything outside the root. */
export function resolveKeyPath(key: string): string {
  const match = KEY_RE.exec(key);
  if (!match) throw new AppError("NOT_FOUND", "Image not found");
  const absolute = path.resolve(uploadRoot(), key);
  const root = uploadRoot();
  if (!absolute.startsWith(root + path.sep)) {
    // Unreachable given KEY_RE, but kept as a belt-and-braces traversal guard.
    throw new AppError("NOT_FOUND", "Image not found");
  }
  return absolute;
}

export function publicUrlFor(key: string): string {
  return `/api/uploads/${key}`;
}

export function isUploadUrl(value: string): boolean {
  const key = /^\/api\/uploads\/(.+)$/.exec(value)?.[1];
  return Boolean(key && KEY_RE.test(key));
}

/** True when `key` belongs to `organizationId` — used to stop cross-tenant reads. */
export function keyBelongsToOrganization(key: string, organizationId: string): boolean {
  return KEY_RE.exec(key)?.[1]?.toLowerCase() === organizationId.toLowerCase();
}

/**
 * Validates and stores an image. Returns the content-addressed key. Writing the
 * same bytes twice is safe: the file name is the hash of the content.
 */
export async function putImage(input: {
  organizationId: string;
  kind: UploadKind;
  bytes: Buffer;
}): Promise<StoredImage> {
  assertSafeSegment(input.organizationId, "Organization");
  if (!UPLOAD_KINDS.includes(input.kind)) {
    throw new AppError("VALIDATION_ERROR", "Unsupported upload type");
  }
  if (input.bytes.length === 0) {
    throw new AppError("VALIDATION_ERROR", "The selected file is empty");
  }
  if (input.bytes.length > MAX_IMAGE_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Images must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB or smaller`,
    );
  }

  const extension = sniffImageType(input.bytes);
  if (!extension) {
    throw new AppError("VALIDATION_ERROR", "Upload a PNG, JPEG, WebP or GIF image");
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const key = `${input.organizationId.toLowerCase()}/${input.kind}/${sha256}.${extension}`;
  const absolute = resolveKeyPath(key);

  await mkdir(path.dirname(absolute), { recursive: true });
  try {
    const existing = await stat(absolute);
    if (existing.size === input.bytes.length) {
      return {
        key,
        url: publicUrlFor(key),
        contentType: IMAGE_CONTENT_TYPES[extension],
        bytes: existing.size,
        sha256,
        extension,
      };
    }
  } catch {
    // Not stored yet (or a partial write); fall through and write it.
  }
  await writeFile(absolute, input.bytes, { mode: 0o644 });
  logger.info("Image stored", { key, bytes: input.bytes.length });

  return {
    key,
    url: publicUrlFor(key),
    contentType: IMAGE_CONTENT_TYPES[extension],
    bytes: input.bytes.length,
    sha256,
    extension,
  };
}

/** Reads a stored image, or null when the key is unknown/malformed. */
export async function readImage(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  let absolute: string;
  try {
    absolute = resolveKeyPath(key);
  } catch {
    return null;
  }
  try {
    const bytes = await readFile(absolute);
    const extension = KEY_RE.exec(key)![4] as ImageExtension;
    return { bytes, contentType: IMAGE_CONTENT_TYPES[extension] };
  } catch {
    return null;
  }
}
