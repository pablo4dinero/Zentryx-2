# Assisted Planning — Gap-Fill + Preference Learning (Design)

Status: **Proposal for review** · Owner: paulpelumi · Scope: MDP → Production Planning

## 1. Problem & goal

The current **Assisted Planning** button (`artifacts/api-server/src/lib/ai-planner.ts`,
`runAssistedPlanning`) is a deterministic, greedy, phase-based scheduler. It:

- leaves **idle gaps** because it places orders phase-by-phase and never circles back
  to fill leftover floor/day capacity optimally, and
- doesn't adapt to the **recurring manual adjustments** the planner makes afterward.

**Goal:** (a) shrink idle gaps, and (b) make the planner *learn the planner's recurring
preferences* from recent weeks — **without ever violating the QC / anti-contamination
hard constraints**, and without pretending to be a self-training neural model.

**Non-goals:**
- No neural-network "training" (5–8 weeks ≈ a handful of data points — far too little).
- No LLM emitting the actual schedule (LLMs hallucinate kg/capacity math).
- No claim of a "perfect" plan — production scheduling is NP-hard; we target *measurably
  better*, not provably optimal.

## 2. Architecture — four layers, rules stay authoritative

```
┌──────────────────────────────────────────────────────────────┐
│ Layer A — HARD CONSTRAINTS (existing engine, AUTHORITATIVE)    │
│   capacity, blend math, floor eligibility, Savory/Sweet,      │
│   Mon-Tue exclusives, Floor1+Floor2 co-location (to add)      │
├──────────────────────────────────────────────────────────────┤
│ Layer B — OPTIMIZER (deterministic)                            │
│   gap-fill second pass + bounded local-search to cut idle min │
├──────────────────────────────────────────────────────────────┤
│ Layer C — PREFERENCE LEARNING (the "studies my decisions")    │
│   capture AI-proposal vs final → mine recurring overrides →   │
│   user-approved preferences → bias planner choices (soft)     │
├──────────────────────────────────────────────────────────────┤
│ Layer D — CLAUDE WEEKLY REVIEW (optional, ANALYSIS ONLY)       │
│   explains patterns + proposes rule changes in plain English  │
└──────────────────────────────────────────────────────────────┘
```

Critical principle: **Layers C/D can only reorder or bias among already-feasible
options. They can never relax a hard constraint** (especially contamination). If a
learned preference conflicts with a QC rule, the QC rule wins, silently.

## 3. Data model changes (`lib/db/src/schema/mdp.ts`)

Applied on boot via the existing idempotent `ALTER TABLE … ADD COLUMN/CREATE TABLE
IF NOT EXISTS` block in `artifacts/api-server/src/index.ts`.

### 3.1 `mdp_plan_snapshots` (new) — the "training data" baseline
Captures the AI proposal at the instant Assisted Planning runs, so we can later diff
it against the human-finalized plan.

| column | type | note |
|---|---|---|
| id | serial pk | |
| week_label | text | |
| kind | text | `"ai_proposal"` \| `"final"` |
| created_by | integer | user id |
| created_at | timestamp | |
| payload | jsonb | array of `{ floorId, productionOrderId, productType, assignedDay, assignedVolume, sortOrder }` |

- Write `ai_proposal` inside `POST /assisted-planning` right after `runAssistedPlanning`.
- Write `final` when the week is closed/produced (or on a manual "snapshot final" / first
  produced order of the week), reading current `mdp_floor_assignments`.

### 3.2 `mdp_planner_preferences` (new) — learned, user-approved rules
| column | type | note |
|---|---|---|
| id | serial pk | |
| kind | text | `floor_day` \| `switch_tolerance` \| `grouping` \| `ordering` |
| product_type | text (nullable) | normalized |
| data | jsonb | rule body (see §5) |
| support | integer | # of recent weeks it held |
| weeks_observed | integer | N considered |
| enabled | boolean default false | **only applied after the user approves** |
| created_at / updated_at | timestamp | |

No schema change needed to `mdp_floor_assignments` (it already has `sort_order`).

## 4. Capturing the signal (diff = proposal vs final)

A pure function `diffPlans(proposal, final)` produces per–production-order adjustments:

- `moved_floor` (Floor A → Floor B)
- `moved_day` (Mon → Wed)
- `reordered_within_day` (sort_order change)
- `volume_changed`
- `added_by_human` / `removed_by_human`

This is the raw evidence the miner consumes. It is computed from the two
`mdp_plan_snapshots` rows for a week (or proposal-snapshot vs live assignments).

## 5. Preference mining (Layer C) — `lib/planner-learning.ts` (new)

`minePreferences(weeks: WeekDiff[]): CandidatePreference[]` over the last N weeks
(default 5, configurable). Each candidate carries **support** (how many of N weeks it
held) and is only auto-surfaced when `support ≥ threshold` (default 3/5).

Rule kinds and their `data`:

- **floor_day** — "product type X is consistently placed on Floor Y, day Z."
  `{ preferredFloorId, preferredDays: ["Wed","Thu"] }`
- **switch_tolerance** — "switch from type A→B is consistently accepted (or always
  avoided)." `{ fromType, toType, tolerated: boolean }`
- **grouping** — "types A and B are kept on the same floor/day." `{ types: [A,B] }`
- **ordering** — "within a day, type A precedes type B." `{ before, after }`

Mining is statistical pattern-counting (not ML) — appropriate for small N.

**User stays in control:** candidates are *surfaced for approval*, never auto-enabled.
This prevents the system from "learning" a one-off mistake, and avoids imitating
imperfect past decisions.

## 6. Preference-aware planning (Layer A/B integration)

`runAssistedPlanning(input)` gains an optional `preferences: EnabledPreference[]`.

- Today, when several cells are eligible, the planner takes the **first** that fits.
- New: compute a **score** for each eligible cell and pick the best, where score =
  base (capacity fit, fewer switches) **+ preference bonuses**:
  - floor_day match → bonus
  - grouping match (same cell already holds a paired type) → bonus
  - tolerated switch → reduce effective switch penalty for that pair
  - ordering preference → influences `sort_order` assigned to placements
- **Hard constraints are checked first and unconditionally**; preferences only break
  ties / bias among feasible options.

## 7. Gap-fill optimizer (Layer B) — biggest immediate win, no learning needed

After the existing phases finish, add `fillGaps()`:

1. For every (floor, day, shift) cell with remaining minutes, find still-unscheduled or
   partially-scheduled orders that are **hard-constraint-eligible** for that cell and
   pull volume forward to consume idle minutes.
2. Bounded **local search**: try a capped number of single-move / swap improvements that
   strictly reduce total idle minutes without violating any hard constraint.

Deterministic and safe — this is what most directly removes the gaps you see, and it
ships independently of any learning.

## 8. Claude weekly review (Layer D, optional) — analysis only

New endpoint `POST /api/mdp/planner-review` using the existing `callModel(SONNET_MODEL,…)`:
- Input: compact JSON summary of the last N weeks' proposal-vs-final diffs + utilization.
- Output: plain-English "here's what you consistently change" + up to 3 concrete,
  *suggested* preference/rule changes for you to approve.
- **Never emits a schedule or kg numbers** — Claude is unreliable at hard combinatorial
  math; it's used only where it's strong (explaining patterns).

## 9. Backend endpoints (new)

| method | path | purpose |
|---|---|---|
| POST | `/api/mdp/assisted-planning` | *(existing)* also writes an `ai_proposal` snapshot + accepts enabled preferences |
| POST | `/api/mdp/plan-snapshots/final` | snapshot the current week as `final` |
| POST | `/api/mdp/planner-learn` | run mining over last N weeks → returns candidate preferences |
| GET / PATCH | `/api/mdp/planner-preferences` | list / enable-disable learned rules |
| POST | `/api/mdp/planner-review` | *(optional)* Claude analysis |

All admin-gated (`requireRole("admin")`) — consistent with floor creation.

## 10. Frontend (`ProductionPlanningTab`)

- **"Learn from recent weeks"** button (admin) → calls `/planner-learn` → opens a review
  panel: *"You moved Breading to Floor 3 Fri in 4 of the last 5 weeks. Apply as a rule?"*
  with **Apply / Dismiss** per candidate.
- **Preferences panel** — list active learned rules with on/off toggles (full control,
  reversible).
- The Assisted Planning button automatically passes enabled preferences and shows a small
  note: *"Planned using N learned preferences."*

## 11. QC safety + the Floor 1 / Floor 2 co-location gap

This work should also close the **known hard-constraint gap**: Floor 1 and Floor 2 share
a room, so a Savory product on Floor 1 and a Sweet product on Floor 2 on the **same day**
can cross-contaminate, but the current conflict check is per-floor only. This must become
a hard constraint (shared contamination zone) **before** layering preferences on top —
otherwise a learned preference could nudge toward a contaminating arrangement.

## 12. Rollout (incremental, each independently shippable)

| Phase | Deliverable | Value | Risk |
|---|---|---|---|
| 0 | Gap-fill optimizer (§7) | Immediate gap reduction | Low |
| 0.5 | Floor1+Floor2 same-day hard constraint (§11) | Closes QC hole | Low |
| 1 | Proposal/final snapshots + `diffPlans` (§3,4) | Builds the dataset | Low |
| 2 | Mining + approval UI (§5,10) | "Studies my decisions" | Med |
| 3 | Preference-aware planning (§6) | Plans match your style | Med |
| 4 | Claude weekly review (§8) | Plain-English guidance | Low |

## 13. Success metrics (track before/after)

- **Idle floor-minutes per week** ↓ (primary gap metric)
- **# of manual adjustments after Assisted Planning** ↓ (preferences working)
- **QC violations** = 0 (must never regress)
- **Unscheduled / partially-scheduled orders** ↓

## 14. Honest expectations

- 5–8 weeks gives reliable **patterns**, not a trained model. The system *adapts to your
  preferences*; it does not "discover" globally optimal plans on its own.
- Quality is bounded by past decisions — if a past plan was imperfect, the miner needs
  the approval gate so it doesn't learn the imperfection.
- The single biggest lever for the gaps you're seeing is **Phase 0 (gap-fill)**, which
  needs no learning at all.
