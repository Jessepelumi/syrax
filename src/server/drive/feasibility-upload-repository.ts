import "server-only";

import { getDatabase } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { newId } from "@/lib/ids";

type FeasibilityEventType =
  | "drive.feasibility_upload.completed"
  | "drive.feasibility_upload.failed"
  | "drive.feasibility_upload.session_created";

export async function recordFeasibilityUploadEvent(input: {
  adminId: string;
  eventType: FeasibilityEventType;
  metadata: Record<string, unknown>;
  uploadId: string;
}): Promise<void> {
  await getDatabase().insert(auditEvents).values({
    id: newId("audit"),
    actorType: "ADMIN",
    actorId: input.adminId,
    eventType: input.eventType,
    resourceType: "drive_feasibility_upload",
    resourceId: input.uploadId,
    metadata: input.metadata,
  });
}
