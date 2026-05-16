import { useState, useCallback } from "react";

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
