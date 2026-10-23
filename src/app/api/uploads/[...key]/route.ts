import { readImage } from "@/lib/storage";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves merchant images.
 *
 * Keys are content-addressed (`org/kind/sha256.ext`) so the response is
 * immutable. The content type comes from the *validated* file extension that
 * was sniffed from the bytes on upload — never from the client — and
 * `nosniff` prevents the browser from reinterpreting the payload.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = (segments ?? []).join("/");

  const image = await readImage(key);
  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  logger.debug("Serving image", { key, bytes: image.bytes.length });
  return new Response(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "content-type": image.contentType,
      "content-length": String(image.bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
