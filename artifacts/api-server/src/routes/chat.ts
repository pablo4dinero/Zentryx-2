import { Router } from "express";
import { db } from "@workspace/db";
import { chatRoomsTable, chatRoomMembersTable, chatMessagesTable, chatReadReceiptsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, inArray, desc, sql, ne } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { SUPERADMIN_EMAIL } from "./auth";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// Upload directory is configurable via env so production deploys can
// point it at a persistent disk (Render Disks, mounted EBS, etc.) or an
// object-store-backed fuse mount. Defaults to a local folder for dev
// convenience; the folder is git-ignored.
const CHAT_UPLOAD_DIR = process.env.CHAT_UPLOAD_DIR
  || path.resolve(process.cwd(), "uploads/chat");
const upload = multer({
  dest: CHAT_UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
});

if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

const MSG_SELECT = {
  id: chatMessagesTable.id,
  roomId: chatMessagesTable.roomId,
  messageType: chatMessagesTable.messageType,
  content: chatMessagesTable.content,
  fileUrl: chatMessagesTable.fileUrl,
  fileName: chatMessagesTable.fileName,
  createdAt: chatMessagesTable.createdAt,
  senderId: chatMessagesTable.senderId,
  senderName: usersTable.name,
  senderRole: usersTable.role,
};

// Helper: when a message is posted, drop a single "new message" notification
// row in front of every other member of the room. The notification deliberately
// doesn't include the message content — only the sender name and a hint to
// open the chat. The frontend notification panel surfaces these alongside any
// other system events.
async function notifyRoomMembers(opts: { roomId: number; senderId: number; senderName: string | null; isGroup: boolean; roomName: string }) {
  try {
    const members = await db.select({ userId: chatRoomMembersTable.userId })
      .from(chatRoomMembersTable)
      .where(eq(chatRoomMembersTable.roomId, opts.roomId));
    const others = members.map(m => m.userId).filter(id => id !== opts.senderId);
    if (others.length === 0) return;
    const from = opts.senderName ?? "a teammate";
    const title = opts.isGroup ? `New message in #${opts.roomName}` : `New message from ${from}`;
    const message = opts.isGroup
      ? `${from} sent a message in #${opts.roomName}. Open the chat to read it.`
      : `${from} sent you a new message. Open the chat to read it.`;
    await db.insert(notificationsTable).values(others.map(userId => ({
      userId,
      type: "update" as const,
      title,
      message,
      isRead: false,
    })));
  } catch (err) {
    console.error("[chat] notifyRoomMembers failed", err);
  }
}

// Helper: update read receipt for user in room
async function markRead(userId: number, roomId: number, messageId: number) {
  const existing = await db.select().from(chatReadReceiptsTable)
    .where(and(eq(chatReadReceiptsTable.userId, userId), eq(chatReadReceiptsTable.roomId, roomId)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(chatReadReceiptsTable)
      .set({ lastReadMessageId: messageId, updatedAt: new Date() })
      .where(and(eq(chatReadReceiptsTable.userId, userId), eq(chatReadReceiptsTable.roomId, roomId)));
  } else {
    await db.insert(chatReadReceiptsTable).values({ userId, roomId, lastReadMessageId: messageId }).catch(() => {});
  }
}

// Get all rooms for current user with last message preview + unread count
router.get("/rooms", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const memberships = await db.select({ roomId: chatRoomMembersTable.roomId })
      .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.userId, userId));
    if (memberships.length === 0) { res.json([]); return; }
    const roomIds = memberships.map(m => m.roomId);
    const rooms = await db.select().from(chatRoomsTable).where(inArray(chatRoomsTable.id, roomIds));

    // For each room, get last message info + member ids so the client can
    // match DM rooms back to specific users without falling back to the
    // ambiguous "match by first name" heuristic (which silently merged any
    // two users that shared a first name into the same chat thread).
    const enriched = await Promise.all(rooms.map(async (room) => {
      const [lastMsg] = await db.select(MSG_SELECT)
        .from(chatMessagesTable)
        .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
        .where(eq(chatMessagesTable.roomId, room.id))
        .orderBy(desc(chatMessagesTable.createdAt))
        .limit(1);

      const [receipt] = await db.select().from(chatReadReceiptsTable)
        .where(and(eq(chatReadReceiptsTable.userId, userId), eq(chatReadReceiptsTable.roomId, room.id)))
        .limit(1);

      const memberRows = await db.select({ userId: chatRoomMembersTable.userId })
        .from(chatRoomMembersTable)
        .where(eq(chatRoomMembersTable.roomId, room.id));

      const lastReadId = receipt?.lastReadMessageId ?? 0;
      const lastMsgId = lastMsg?.id ?? 0;
      const hasUnread = lastMsg && lastMsg.senderId !== userId && lastMsgId > lastReadId;

      return {
        ...room,
        lastMessageAt: lastMsg?.createdAt ?? room.createdAt,
        lastMessagePreview: lastMsg?.content ?? null,
        lastMessageSender: lastMsg?.senderName ?? null,
        lastMessageType: lastMsg?.messageType ?? null,
        hasUnread: !!hasUnread,
        memberUserIds: memberRows.map(m => m.userId),
      };
    }));

    // Sort by most recent message
    enriched.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Create a room (or return existing DM between two users)
router.post("/rooms", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, isGroup, memberIds } = req.body;
    const userId = req.user!.userId;

    // Resolve superadmin DB id so we can strip them from any member list
    const [sa] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, SUPERADMIN_EMAIL)).limit(1);
    const saId = sa?.id;

    const rawIds = [...new Set([userId, ...(memberIds || [])])];
    // Privacy rule: regular users can't pull the superadmin into a room. But
    // the superadmin must still be able to start their own DMs and groups —
    // otherwise the creator gets filtered out, no chatRoomMembers row is
    // inserted for them, and every click creates an orphan room their /rooms
    // list never returns. That's the "history clears" bug.
    const allMemberIds = saId && userId !== saId
      ? rawIds.filter(id => id !== saId)
      : rawIds;

    if (isGroup === false && allMemberIds.length === 2) {
      const otherId = allMemberIds.find(id => id !== userId)!;
      const myRooms = await db.select({ roomId: chatRoomMembersTable.roomId })
        .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.userId, userId));
      const otherRooms = await db.select({ roomId: chatRoomMembersTable.roomId })
        .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.userId, otherId));
      const myRoomIds = myRooms.map(r => r.roomId);
      const otherRoomIds = new Set(otherRooms.map(r => r.roomId));
      const sharedIds = myRoomIds.filter(id => otherRoomIds.has(id));
      if (sharedIds.length > 0) {
        const existing = await db.select().from(chatRoomsTable)
          .where(and(inArray(chatRoomsTable.id, sharedIds), eq(chatRoomsTable.isGroup, false)))
          .limit(1);
        if (existing.length > 0) { res.status(201).json(existing[0]); return; }
      }
    }

    const [room] = await db.insert(chatRoomsTable).values({
      name, isGroup: isGroup !== false, createdById: userId,
    }).returning();
    for (const uid of allMemberIds) {
      await db.insert(chatRoomMembersTable).values({ roomId: room.id, userId: uid }).catch(() => {});
    }
    res.status(201).json(room);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Edit a group channel — rename and/or swap members. Creator only.
// Body: { name?: string, memberIds?: number[] }
// memberIds, if provided, REPLACES the room's member list (creator is
// always preserved; superadmin is stripped unless the requester is the
// superadmin, matching POST /rooms behaviour).
router.patch("/rooms/:roomId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const userId = req.user!.userId;
    const { name, memberIds } = req.body as { name?: string; memberIds?: number[] };

    const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    if (!room) { res.status(404).json({ error: "NotFound" }); return; }
    if (room.createdById !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!room.isGroup) { res.status(400).json({ error: "DMNotEditable" }); return; }

    if (typeof name === "string" && name.trim() !== "" && name !== room.name) {
      await db.update(chatRoomsTable).set({ name: name.trim() }).where(eq(chatRoomsTable.id, roomId));
    }

    if (Array.isArray(memberIds)) {
      const [sa] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.email, SUPERADMIN_EMAIL)).limit(1);
      const saId = sa?.id;
      const requested = new Set<number>([room.createdById, ...memberIds]);
      const desired = saId && userId !== saId
        ? new Set([...requested].filter(id => id !== saId))
        : requested;

      const existingRows = await db.select({ userId: chatRoomMembersTable.userId })
        .from(chatRoomMembersTable)
        .where(eq(chatRoomMembersTable.roomId, roomId));
      const existing = new Set(existingRows.map(r => r.userId));

      const toAdd = [...desired].filter(id => !existing.has(id));
      const toRemove = [...existing].filter(id => !desired.has(id) && id !== room.createdById);

      for (const uid of toAdd) {
        await db.insert(chatRoomMembersTable).values({ roomId, userId: uid }).catch(() => {});
      }
      if (toRemove.length > 0) {
        await db.delete(chatRoomMembersTable).where(and(
          eq(chatRoomMembersTable.roomId, roomId),
          inArray(chatRoomMembersTable.userId, toRemove),
        ));
      }
    }

    const [updated] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    const memberRows = await db.select({ userId: chatRoomMembersTable.userId })
      .from(chatRoomMembersTable)
      .where(eq(chatRoomMembersTable.roomId, roomId));
    res.json({ ...updated, memberUserIds: memberRows.map(m => m.userId) });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Delete a room (creator only) or leave it
router.delete("/rooms/:roomId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const userId = req.user!.userId;
    const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    if (!room) { res.status(404).json({ error: "NotFound" }); return; }
    if (room.createdById === userId) {
      await db.delete(chatRoomsTable).where(eq(chatRoomsTable.id, roomId));
      res.json({ deleted: true });
    } else {
      await db.delete(chatRoomMembersTable).where(
        and(eq(chatRoomMembersTable.roomId, roomId), eq(chatRoomMembersTable.userId, userId))
      );
      res.json({ left: true });
    }
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Get messages for a room + mark as read
router.get("/rooms/:roomId/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit)) || 100, 200);
    const messages = await db.select(MSG_SELECT)
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(eq(chatMessagesTable.roomId, roomId))
      .orderBy(chatMessagesTable.createdAt)
      .limit(limit);

    // Get read receipts for all members in this room (for seen indicators)
    const members = await db.select({ userId: chatRoomMembersTable.userId })
      .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.roomId, roomId));
    const memberIds = members.map(m => m.userId).filter(id => id !== userId);
    const receipts = memberIds.length > 0
      ? await db.select().from(chatReadReceiptsTable)
          .where(and(eq(chatReadReceiptsTable.roomId, roomId), inArray(chatReadReceiptsTable.userId, memberIds)))
      : [];

    // Auto mark-as-read: update receipt for current user to last message
    if (messages.length > 0) {
      const lastId = messages[messages.length - 1].id;
      await markRead(userId, roomId, lastId).catch(() => {});
    }

    // Attach seenByOthers flag to each message
    const seenMap = new Map(receipts.map(r => [r.userId, r.lastReadMessageId ?? 0]));
    const enriched = messages.map(m => ({
      ...m,
      seenBy: memberIds.filter(uid => (seenMap.get(uid) ?? 0) >= m.id),
    }));

    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Mark room as read (explicit)
router.post("/rooms/:roomId/read", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const userId = req.user!.userId;
    const { messageId } = req.body;
    await markRead(userId, roomId, messageId);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Send a text message
router.post("/rooms/:roomId/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const { content, messageType } = req.body;
    const [msg] = await db.insert(chatMessagesTable).values({
      roomId, senderId: req.user!.userId,
      messageType: messageType || "text",
      content,
    }).returning();
    const [withSender] = await db.select(MSG_SELECT)
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(eq(chatMessagesTable.id, msg.id));
    // Auto-mark sender as read
    await markRead(req.user!.userId, roomId, msg.id).catch(() => {});
    // Drop a notification for every other room member (no message body)
    const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    if (room) {
      await notifyRoomMembers({
        roomId,
        senderId: req.user!.userId,
        senderName: withSender?.senderName ?? null,
        isGroup: !!room.isGroup,
        roomName: room.name ?? "",
      });
    }
    res.status(201).json({ ...withSender, seenBy: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Delete a message (sender only)
router.delete("/rooms/:roomId/messages/:messageId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const messageId = parseInt(Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId as string);
    const userId = req.user!.userId;
    const [msg] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, messageId)).limit(1);
    if (!msg) { res.status(404).json({ error: "NotFound" }); return; }
    if (msg.senderId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, messageId));
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Upload any file (images, voice notes, documents — max 5 MB)
router.post("/rooms/:roomId/upload", requireAuth, (req: AuthRequest, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "FileTooLarge", message: "File exceeds the 5 MB limit." });
      } else {
        res.status(400).json({ error: "UploadError", message: err.message });
      }
      return;
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const messageType = (req.body.messageType as any) || (req.file.mimetype.startsWith("audio") ? "voice_note" : "image");
    const fileUrl = `/api/chat/uploads/${req.file.filename}`;
    const [msg] = await db.insert(chatMessagesTable).values({
      roomId, senderId: req.user!.userId, messageType,
      fileUrl, fileName: req.file.originalname,
    }).returning();
    const [withSender] = await db.select(MSG_SELECT)
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(eq(chatMessagesTable.id, msg.id));
    await markRead(req.user!.userId, roomId, msg.id).catch(() => {});
    const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    if (room) {
      await notifyRoomMembers({
        roomId,
        senderId: req.user!.userId,
        senderName: withSender?.senderName ?? null,
        isGroup: !!room.isGroup,
        roomName: room.name ?? "",
      });
    }
    res.status(201).json({ ...withSender, seenBy: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Serve uploaded files. Filename validation guards against path traversal
// (e.g. `?filename=../../etc/passwd`) — multer generates random IDs so a
// legitimate filename is always alphanumeric.
router.get("/uploads/:filename", (req, res) => {
  const filename = req.params.filename;
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
    res.status(400).json({ error: "BadRequest" });
    return;
  }
  const filePath = path.resolve(CHAT_UPLOAD_DIR, filename);
  if (!filePath.startsWith(path.resolve(CHAT_UPLOAD_DIR))) {
    res.status(400).json({ error: "BadRequest" });
    return;
  }
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "NotFound" });
  });
});

// Get all users for private chat (superadmin always excluded). Includes the
// profile fields the chat View-Profile dialog needs (department, role,
// phone, avatar) so the client doesn't have to make a second round-trip.
router.get("/users", requireAuth, async (_req, res) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      department: usersTable.department,
      jobPosition: usersTable.jobPosition,
      phone: usersTable.phone,
      avatar: usersTable.avatar,
      isActive: usersTable.isActive,
    })
      .from(usersTable)
      .where(ne(usersTable.email, SUPERADMIN_EMAIL));
    res.json(users);
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

export default router;
