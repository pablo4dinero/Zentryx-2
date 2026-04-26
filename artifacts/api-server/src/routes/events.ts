import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  try {
    const events = await db.select().from(eventsTable).orderBy(eventsTable.startDate);
    const enriched = await Promise.all(events.map(async (ev) => {
      const attendees = ev.attendeeIds.length > 0
        ? await db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
            .from(usersTable).where(eq(usersTable.id, ev.attendeeIds[0])).limit(10)
        : [];
      const allAttendees = ev.attendeeIds.length > 0
        ? await db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role }).from(usersTable)
        : [];
      const filteredAttendees = allAttendees.filter(u => ev.attendeeIds.includes(u.id));
      const [creator] = ev.createdById
        ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ev.createdById)).limit(1)
        : [null];
      return { ...ev, attendees: filteredAttendees, creator: creator || null };
    }));
    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, description, startDate, endDate, location, attendeeIds, eventType, color } = req.body;
    if (!title || !startDate) { res.status(400).json({ error: "BadRequest", message: "title and startDate required" }); return; }
    const [ev] = await db.insert(eventsTable).values({
      title, description: description || null,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      location: location || null,
      attendeeIds: Array.isArray(attendeeIds) ? attendeeIds : [],
      eventType: eventType || "general",
      color: color || "#6c5ce7",
      createdById: req.user!.userId,
    }).returning();
    res.status(201).json(ev);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, startDate, endDate, location, attendeeIds, eventType, color } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (startDate !== undefined) updates.startDate = new Date(startDate);
    if (endDate !== undefined) updates.endDate = endDate ? new Date(endDate) : null;
    if (location !== undefined) updates.location = location;
    if (attendeeIds !== undefined) updates.attendeeIds = attendeeIds;
    if (eventType !== undefined) updates.eventType = eventType;
    if (color !== undefined) updates.color = color;
    const [ev] = await db.update(eventsTable).set(updates).where(eq(eventsTable.id, id)).returning();
    res.json(ev);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(eventsTable).where(eq(eventsTable.id, id));
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

export default router;
