import "server-only";

import { newId } from "@/lib/ids";
import { isAllowedUploadMimeType } from "@/lib/mime";
import { normalizeDisplayText } from "@/lib/text";
import {
  assertPortalAcceptsSubmissions,
  PortalServiceError,
  resolvePublicPortal,
} from "@/server/portals/portal-service";
import {
  PortalPolicyError,
  type SubmissionFilePlan,
  validateSubmissionPlan,
} from "@/server/portals/portal-policy";
import {
  createSubmissionRecord,
  type NewUploadFileRecord,
} from "@/server/submissions/submission-repository";
import { createDestinationFileName } from "@/server/uploads/file-name";

export interface CreateSubmissionInput {
  files: SubmissionFilePlan[];
  guestName?: string;
  portalToken: string;
}

export interface CreatedSubmission {
  files: Array<{ clientFileId: string; fileId: string }>;
  receiptId: string;
  submissionId: string;
}

function normalizeGuestName(value: string | undefined): string | undefined {
  const normalized = value ? normalizeDisplayText(value, 100) : undefined;

  if (!normalized) {
    return undefined;
  }

  return normalized;
}

export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<CreatedSubmission> {
  const portal = await resolvePublicPortal(input.portalToken);

  if (!portal) {
    throw new PortalServiceError("PORTAL_NOT_FOUND");
  }

  assertPortalAcceptsSubmissions(portal);

  const validated = validateSubmissionPlan(
    {
      allowedMimeTypes: portal.allowedMimeTypes,
      maxImageBytesPerSubmission: portal.maxImageBytesPerSubmission,
      maxImageFileSizeBytes: portal.maxImageFileSizeBytes,
      maxFilesPerSubmission: portal.maxFilesPerSubmission,
      maxSubmissionBytes: portal.maxSubmissionBytes,
      maxVideoBytesPerSubmission: portal.maxVideoBytesPerSubmission,
      maxVideoFileSizeBytes: portal.maxVideoFileSizeBytes,
    },
    input.files,
  );
  const uploadedAt = new Date();
  const submissionId = newId("submission");
  const preparedFiles: NewUploadFileRecord[] = input.files.map((file) => {
    if (!isAllowedUploadMimeType(file.mimeType)) {
      throw new PortalPolicyError("FILE_TYPE_NOT_ALLOWED");
    }

    const fileId = newId("file");
    const names = createDestinationFileName({
      fileId,
      mimeType: file.mimeType,
      originalName: file.name,
      submissionId,
      uploadedAt,
    });

    return {
      id: fileId,
      clientFileId: file.clientFileId,
      originalName: names.sanitizedOriginalName,
      destinationName: names.destinationName,
      declaredMimeType: file.mimeType,
      declaredSizeBytes: file.sizeBytes,
    };
  });

  const created = await createSubmissionRecord({
    portalId: portal.id,
    submissionId,
    guestName: normalizeGuestName(input.guestName),
    files: preparedFiles,
    totalDeclaredBytes: validated.totalDeclaredBytes,
  });

  if (!created) {
    const current = await resolvePublicPortal(input.portalToken);

    if (!current) {
      throw new PortalServiceError("PORTAL_NOT_FOUND");
    }

    assertPortalAcceptsSubmissions(current);
    throw new PortalServiceError("PORTAL_STATE_CONFLICT");
  }

  return {
    submissionId: created.submissionId,
    receiptId: created.submissionId,
    files: created.fileIds,
  };
}
