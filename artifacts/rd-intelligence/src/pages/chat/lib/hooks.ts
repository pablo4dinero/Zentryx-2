import { useState, useEffect, useCallback } from "react";
import { BASE } from "./constants";

export function useApi() {
  const token = () => localStorage.getItem("rd_token");
  const authHeader = () => ({ Authorization: `Bearer ${token()}` });

  // Always bypass the browser cache so 304s never cause empty-body parse failures
  const get = (path: string) =>
    fetch(`${BASE}api${path}`, {
      headers: { ...authHeader(), "Cache-Control": "no-cache" },
      cache: "no-store",
    }).then(r => {
      if (!r.ok) return null;           // auth errors / 5xx — caller guards with Array.isArray
      return r.json().catch(() => null); // empty body safety net
    });

  const post = (path: string, body: any) =>
    fetch(`${BASE}api${path}`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const patch = (path: string, body: any) =>
    fetch(`${BASE}api${path}`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const postForm = (path: string, data: FormData) =>
    fetch(`${BASE}api${path}`, { method: "POST", headers: authHeader(), body: data }).then(r => r.json());

  const del = (path: string) =>
    fetch(`${BASE}api${path}`, { method: "DELETE", headers: authHeader() }).then(r => r.json());

  return { get, post, patch, postForm, del, token };
}

export function usePinnedRooms() {
  const key = "rd_pinned_rooms";
  const [pins, setPins] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  });
  const toggle = useCallback((id: number) => {
    setPins(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, []);
  const isPinned = (id: number) => pins.includes(id);
  return { isPinned, toggle };
}

export function usePinnedMessages(roomId: number) {
  const key = `rd_pinned_msgs_${roomId}`;
  const [pins, setPins] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { setPins(JSON.parse(localStorage.getItem(key) || "[]")); } catch { setPins([]); }
  }, [roomId]);
  const toggle = useCallback((id: number) => {
    setPins(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(`rd_pinned_msgs_${roomId}`, JSON.stringify(next));
      return next;
    });
  }, [roomId]);
  const isPinned = (id: number) => pins.includes(id);
  return { isPinned, toggle };
}
