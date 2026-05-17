import { randomUUID } from "crypto";

export interface AccessRequest {
  id: string;
  userId: number;
  email: string;
  name: string;
  requestedAt: Date;
  expiresAt: Date;
  status: "pending" | "approved" | "denied";
  approvedToken?: string;
}

const store = new Map<string, AccessRequest>();
const EXPIRY_MS = 15 * 60 * 1000;

export function createAccessRequest(userId: number, email: string, name: string): AccessRequest {
  // Cancel any existing pending request for this user
  for (const [id, req] of store.entries()) {
    if (req.userId === userId && req.status === "pending") store.delete(id);
  }
  const id = randomUUID();
  const request: AccessRequest = {
    id, userId, email, name,
    requestedAt: new Date(),
    expiresAt: new Date(Date.now() + EXPIRY_MS),
    status: "pending",
  };
  store.set(id, request);
  return request;
}

export function getRequest(id: string): AccessRequest | undefined {
  const req = store.get(id);
  if (!req) return undefined;
  if (Date.now() > req.expiresAt.getTime()) { store.delete(id); return undefined; }
  return req;
}

export function getPendingRequests(): AccessRequest[] {
  const pending: AccessRequest[] = [];
  for (const [id, req] of store.entries()) {
    if (Date.now() > req.expiresAt.getTime()) { store.delete(id); continue; }
    if (req.status === "pending") pending.push(req);
  }
  return pending.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
}

export function approveRequest(id: string, token: string): boolean {
  const req = store.get(id);
  if (!req || req.status !== "pending") return false;
  req.status = "approved";
  req.approvedToken = token;
  return true;
}

export function denyRequest(id: string): boolean {
  const req = store.get(id);
  if (!req || req.status !== "pending") return false;
  req.status = "denied";
  return true;
}
