import { db } from "@workspace/db";
import { activityLogsTable } from "@workspace/db";

export async function logActivity(
  userId: number,
  action: string,
  entityType: string,
  entityId?: number,
  details?: string
) {
  try {
    await db.insert(activityLogsTable).values({ userId, action, entityType, entityId, details });
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}
