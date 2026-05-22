import { useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;
function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("rd_token")}`,
    "Content-Type": "application/json",
  };
}

export const DEFAULT_STAGES = [
  "testing", "reformulation", "innovation", "cost_optimization", "modification",
  "ideation", "research", "formulation", "validation", "scale_up", "commercialization",
];
export const DEFAULT_STATUSES = [
  "approved", "awaiting_feedback", "on_hold", "in_progress", "new_inventory",
  "cancelled", "pushed_to_live", "active", "completed",
];
export const DEFAULT_PRODUCT_TYPES = [
  "Seasoning", "Snack Dusting", "Bread & Dough Premix", "Dairy Premix",
  "Functional Blend", "Pasta Sauce", "Sweet Flavour", "Savoury Flavour",
];
export const DEFAULT_PRIORITIES = ["low", "medium", "high", "critical"];

export function useCustomOptions(key: string, defaults: string[]) {
  const storageKey = `project-opts-${key}`;
  const [options, setOptions] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem(storageKey);
      return s ? JSON.parse(s) : [...defaults];
    } catch { return [...defaults]; }
  });

  const save = useCallback((next: string[]) => {
    setOptions(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  }, [storageKey]);

  const addOption = useCallback((value: string) => {
    const v = value.trim();
    if (!v) return;
    setOptions(prev => {
      if (prev.includes(v)) return prev;
      const next = [...prev, v];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [storageKey]);

  const deleteOption = useCallback((value: string) => {
    setOptions(prev => {
      const next = prev.filter(o => o !== value);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [storageKey]);

  const renameOption = useCallback((oldValue: string, newValue: string) => {
    const v = newValue.trim();
    if (!v) return;
    setOptions(prev => {
      if (v !== oldValue && prev.includes(v)) return prev;
      const next = prev.map(o => (o === oldValue ? v : o));
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [storageKey]);

  return { options, save, addOption, deleteOption, renameOption };
}

export type CustomOptionsHandle = ReturnType<typeof useCustomOptions>;

export const displayLabel = (v: string) => v.replace(/_/g, " ");

// Generic server-synced picklist (stages, statuses, priorities, etc.). Same
// shape as useCustomOptions so it can be swapped in at call sites that
// previously used localStorage. Backed by /api/option-lists/:listKey.
export function useServerOptionList(listKey: string): CustomOptionsHandle {
  const queryClient = useQueryClient();
  const queryKey = ["/api/option-lists", listKey] as const;

  const { data: rows = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${BASE}api/option-lists/${encodeURIComponent(listKey)}`, { headers: authHeaders() });
      if (!res.ok) return [] as Array<{ id: number; name: string }>;
      return res.json() as Promise<Array<{ id: number; name: string }>>;
    },
    staleTime: 1000 * 30,
  });

  const options = rows.map(r => r.name);
  const idByName = new Map(rows.map(r => [r.name, r.id]));
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${BASE}api/option-lists/${encodeURIComponent(listKey)}`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to add option");
      return res.json();
    },
    onSuccess: invalidate,
  });

  const renameMut = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`${BASE}api/option-lists/${encodeURIComponent(listKey)}/${id}`, {
        method: "PUT", headers: authHeaders(), body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename option");
      return res.json();
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/option-lists/${encodeURIComponent(listKey)}/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete option");
      return res.json();
    },
    onSuccess: invalidate,
  });

  const addOption = useCallback((value: string) => {
    const v = value.trim();
    if (!v || idByName.has(v)) return;
    addMut.mutate(v);
  }, [addMut, idByName]);

  const deleteOption = useCallback((value: string) => {
    const id = idByName.get(value);
    if (!id) return;
    deleteMut.mutate(id);
  }, [deleteMut, idByName]);

  const renameOption = useCallback((oldValue: string, newValue: string) => {
    const v = newValue.trim();
    if (!v) return;
    const id = idByName.get(oldValue);
    if (!id) return;
    if (v !== oldValue && idByName.has(v)) return;
    renameMut.mutate({ id, name: v });
  }, [renameMut, idByName]);

  const save = useCallback((_next: string[]) => {
    // Server-backed list — use add/delete/rename instead.
  }, []);

  return { options, save, addOption, deleteOption, renameOption };
}

// Server-synced product type list. Same shape as useCustomOptions so it can be
// swapped in at call sites that previously used localStorage. Backed by the
// /api/product-types endpoints — all clients see the same list and edits
// propagate via React Query invalidation.
export function useServerProductTypes(): CustomOptionsHandle {
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["/api/product-types"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/product-types`, { headers: authHeaders() });
      if (!res.ok) return [] as Array<{ id: number; name: string }>;
      return res.json() as Promise<Array<{ id: number; name: string }>>;
    },
    staleTime: 1000 * 30,
  });

  const options = rows.map(r => r.name);
  const idByName = new Map(rows.map(r => [r.name, r.id]));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/product-types"] });

  const addMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${BASE}api/product-types`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to add product type");
      return res.json();
    },
    onSuccess: invalidate,
  });

  const renameMut = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`${BASE}api/product-types/${id}`, {
        method: "PUT", headers: authHeaders(), body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename product type");
      return res.json();
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/product-types/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete product type");
      return res.json();
    },
    onSuccess: invalidate,
  });

  const addOption = useCallback((value: string) => {
    const v = value.trim();
    if (!v) return;
    if (idByName.has(v)) return;
    addMut.mutate(v);
  }, [addMut, idByName]);

  const deleteOption = useCallback((value: string) => {
    const id = idByName.get(value);
    if (!id) return;
    deleteMut.mutate(id);
  }, [deleteMut, idByName]);

  const renameOption = useCallback((oldValue: string, newValue: string) => {
    const v = newValue.trim();
    if (!v) return;
    const id = idByName.get(oldValue);
    if (!id) return;
    if (v !== oldValue && idByName.has(v)) return;
    renameMut.mutate({ id, name: v });
  }, [renameMut, idByName]);

  const save = useCallback((_next: string[]) => {
    // Server-backed list has no batch save — use add/delete/rename instead.
  }, []);

  return { options, save, addOption, deleteOption, renameOption };
}
