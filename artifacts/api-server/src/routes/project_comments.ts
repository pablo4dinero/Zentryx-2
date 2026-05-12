import { Router } from "express";
import { db } from "@workspace/db";
import { projectCommentsTable, usersTable, notificationsTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router({ mergeParams: true });

router.get("/", requireAuth, async (req, res) => {
  try {
    const projectId = parseInt(Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId as string);
    const comments = await db.select({
      id: projectCommentsTable.id,
      projectId: projectCommentsTable.projectId,
      content: projectCommentsTable.content,
      createdAt: projectCommentsTable.createdAt,
      updatedAt: projectCommentsTable.updatedAt,
      authorId: projectCommentsTable.authorId,
      authorName: usersTable.name,
      authorRole: usersTable.role,
    })
    .from(projectCommentsTable)
    .leftJoin(usersTable, eq(projectCommentsTable.authorId, usersTable.id))
    .where(eq(projectCommentsTable.projectId, projectId))
    .orderBy(projectCommentsTable.createdAt);
    res.json(comments);
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId as string);
    const { content, mentionedUserIds } = req.body;
    if (!content) { res.status(400).json({ error: "BadRequest", message: "Content required" }); return; }
    const [comment] = await db.insert(projectCommentsTable).values({
      projectId, content, authorId: req.user!.userId,
    }).returning();
    const [withAuthor] = await db.select({
      id: projectCommentsTable.id,
      projectId: projectCommentsTable.projectId,
      content: projectCommentsTable.content,
      createdAt: projectCommentsTable.createdAt,
      updatedAt: projectCommentsTable.updatedAt,
      authorId: projectCommentsTable.authorId,
      authorName: usersTable.name,
      authorRole: usersTable.role,
    })
    .from(projectCommentsTable)
    .leftJoin(usersTable, eq(projectCommentsTable.authorId, usersTable.id))
    .where(eq(projectCommentsTable.id, comment.id));

    if (Array.isArray(mentionedUserIds) && mentionedUserIds.length > 0) {
      const [project] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
      const authorName = withAuthor?.authorName || "Someone";
      const uniqueIds = [...new Set(mentionedUserIds as number[])].filter(id => id !== req.user!.userId);
      if (uniqueIds.length > 0) {
        await db.insert(notificationsTable).values(
          uniqueIds.map(userId => ({
            userId,
            type: "mention" as const,
            title: `You were mentioned in a status report`,
            message: `${authorName} mentioned you in a status report on "${project?.name || "a project"}": ${content.slice(0, 120)}${content.length > 120 ? "..." : ""}`,
            projectId,
          }))
        );
      }
    }

    res.status(201).json(withAuthor);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

router.delete("/:commentId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const commentId = parseInt(Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId as string);
    await db.delete(projectCommentsTable).where(eq(projectCommentsTable.id, commentId));
    res.status(204).send();
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

export default router;
