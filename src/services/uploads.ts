import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { MAX_IMAGE_BYTES, putImage, type StoredImage, type UploadKind } from "@/lib/storage";

/**
 * Converts an uploaded `File` from a server action into a stored image and
 * returns its public URL. All validation lives in `putImage`; this layer only
 * bridges FormData and the database.
 */
export async function saveUploadedImage(input: {
  organizationId: string;
  kind: UploadKind;
  file: File;
}): Promise<StoredImage> {
  if (!(input.file instanceof File) || input.file.size === 0) {
    throw new AppError("VALIDATION_ERROR", "Choose an image to upload");
  }
  if (input.file.size > MAX_IMAGE_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Images must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB or smaller`,
    );
  }
  const bytes = Buffer.from(await input.file.arrayBuffer());
  return putImage({ organizationId: input.organizationId, kind: input.kind, bytes });
}

export async function setOrganizationLogo(input: {
  organizationId: string;
  actor: { id: string; email: string };
  logoUrl: string | null;
}) {
  const [updated] = await db
    .update(organizations)
    .set({ logoUrl: input.logoUrl })
    .where(eq(organizations.id, input.organizationId))
    .returning();
  await audit({
    action: "org.updated",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "organization",
    targetId: input.organizationId,
    metadata: { updatedFields: ["logoUrl"], logoUrl: input.logoUrl },
  });
  return updated!;
}

export async function setUserAvatar(input: { userId: string; avatarUrl: string | null }) {
  const [updated] = await db
    .update(users)
    .set({ avatarUrl: input.avatarUrl })
    .where(eq(users.id, input.userId))
    .returning();
  return updated!;
}
