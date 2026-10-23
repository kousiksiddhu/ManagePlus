# ManagePlus — module contracts

Read this together with `shared/types.ts` before implementing a feature module.
The foundation (store, auth, shell, UI kit, routing) is complete — feature
modules fill in their route file(s) under `server/routes/` and their page(s)
under `src/pages/`.

## Stack & commands

- React 18 + TypeScript (strict) + Vite (`src/`), Express (`server/`),
  ExcelJS workbook at `data/manageplus.xlsx` as source of truth.
- `npm run typecheck` — checks the whole repo. Other modules are being built
  concurrently, so ignore errors in files you don't own; your own files must
  be clean: `npx tsc --noEmit 2>&1 | grep <your-file>` should be empty.
- Do NOT run the dev server, seed, install packages, or edit files outside
  your ownership list. Routers are already mounted; pages are already routed.

## Shared foundation you build on

### Server (`server/store.ts`, `server/auth.ts`)

```ts
import { store, newId, isoDate, addMonths, SHEETS } from '../store';
import { ApiError, requireManager, requireAdmin, canView, canManage,
         assertCanView, assertCanManage, hashPassword } from '../auth';
```

- Every `/api/*` router is mounted behind `requireAuth`: `req.actor` is always
  an `EmployeeOut` (`.role` is `'employee' | 'manager' | 'admin'`).
- `store.ready()` is called by requireAuth each request (reloads the workbook
  if it was edited in Excel). Call `await store.ready()` again only if you need
  absolute freshness mid-handler; usually unnecessary.
- Store API (all reads synchronous, all writes async and persist to xlsx):
  - `store.employees(): EmployeeOut[]`, `store.getEmployee(id)`,
    `store.getEmployeeRow(id)` (raw row incl. internal fields),
    `store.directReports(id)`, `store.subtreeIds(id)` (descendants, no self),
    `store.visibleIds(actor)` (self + subtree; admin = everyone),
    `store.buildTree(rootId): TreeNode | null`, `store.nextEmployeeId()`,
    `store.insertEmployee(row)`, `store.updateEmployee(id, patch)`,
    `store.deleteEmployee(id)` (re-parents mentees, cascades related rows).
  - `store.columns(): ColumnDef[]` (sorted), `store.addColumn({key,label,type,options})`,
    `store.updateColumn(key, patch)`, `store.removeColumn(key)` (rejects core).
  - Typed getters: `store.designationGoals()`, `store.individualGoals()`,
    `store.reviewCycles()`, `store.feedback()`, `store.skillWill()`.
  - Generic CRUD for those sheets: `store.insertRow(SHEETS.x, row)`,
    `store.updateRow(SHEETS.x, id, patch)`, `store.removeRow(SHEETS.x, id)`.
    Rows store scalars; write `''` not null/undefined for empty cells.
  - `store.goalTitle(goalId)` → title or null; `store.checkinStatus(employeeId)`
    → `CheckinStatus` (quarterly continuous-feedback cadence).
  - `newId('fb')` → `"fb-1a2b3c4d"`.
- Throw `new ApiError(status, message)` for user errors; the global error
  handler formats `{ error }`. Wrap async handlers in try/catch + `next(err)`.
- RBAC rules: **view** = self, subtree, or admin (`assertCanView`);
  **manage** (create/edit/delete/feedback/goals for someone) = admin or
  manager over their subtree, never self (`assertCanManage`). Enforce on the
  server for every endpoint; never trust client-side checks.

### Client (`src/`)

```ts
import { api, downloadFile, useFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Modal, ConfirmDialog, Badge, Avatar, Field, Spinner,
         EmptyState, ErrorBanner, TagList, statusTone, statusLabel,
         growthTone, formatDate } from '../components/ui';
```

- `api<T>(path, {method, body})` throws `ApiError` with server message.
- `useFetch<T>(path | null)` → `{ data, error, loading, reload }`.
- `downloadFile(path, body, filename)` for the Excel export.
- `useAuth()` → `{ me: EmployeeOut, logout, ... }`.
- Icons: `lucide-react`. Router: `react-router-dom` v6 (`useParams`, `Link`,
  `useNavigate`). No new dependencies.
- Design system: use the classes in `src/styles/global.css` — `.card`,
  `.table-wrap > table.table`, `.btn/.btn-primary/.btn-danger/.btn-ghost/.btn-sm`,
  `.icon-btn`, `.input/.select/.textarea`, `.field`, `.form-row`, `.badge`,
  `.chip`, `.tabs/.tab`, `.segmented`, `.stat-row/.stat-tile`, `.empty-state`,
  `.error-banner`, `.page`, `.page-header`. Colors ONLY via CSS variables
  (`var(--accent)` etc.) so all four themes work. You may add a small
  `<style>`-free feature CSS file `src/styles/<feature>.css` imported from
  your page if you need layout the utility classes can't express.
- Every page must handle loading (`<Spinner/>`), error (`<ErrorBanner/>`),
  and empty (`<EmptyState/>`) states, and wrap content in `<div className="page">`
  with a `<PageHeader/>`.

## Module contracts

### A — Team list (`server/routes/employees.ts`, `src/pages/TeamPage.tsx`)

Endpoints (manager/admin only except where noted):

- `GET /api/employees?view=flat|tree&scope=mine|all`
  - `flat` → `{ employees: EmployeeOut[] }` — actor + full subtree; `scope=all`
    (admin only) → everyone.
  - `tree` → `{ roots: TreeNode[] }` — manager: `[buildTree(actor)]`;
    admin with `scope=all`: forest of all mentorless roots.
  - Any authenticated user may call with default scope (they just see
    themselves if they have no mentees).
- `POST /api/employees` (manager/admin) — body: partial Employee; requires
  `name`, `email`, `designation`; `mentorId` must be visible to the actor
  (manager: self or subtree; admin: anyone or `''`). Auto `employeeId` via
  `store.nextEmployeeId()` when omitted; set `isAdmin:'no'` and
  `passwordHash: hashPassword('welcome123')` on the raw row. Reject duplicate
  emails. → `{ employee: EmployeeOut }`.
- `PATCH /api/employees/:id` (assertCanManage; admins may also edit
  themselves) — accepts core + custom column keys; reject changes to
  `employeeId`/`passwordHash`; validate `mentorId` (must not create a cycle:
  new mentor can't be the employee itself or one of its descendants).
  → `{ employee: EmployeeOut }`.
- `DELETE /api/employees/:id` (assertCanManage) → `{ ok: true }`.
- `GET /api/columns` (any role) → `{ columns: ColumnDef[] }`.
- `POST /api/columns` (manager/admin) — `{ label, type, options? }`; derive
  `key` as camelCase slug of label; reject collisions with existing keys and
  with internal fields (`passwordHash`, `isAdmin`). → `{ column: ColumnDef }`.
- `PATCH /api/columns/:key` (manager/admin) — `{ label?, type?, options?,
  visible?, order? }` → `{ column: ColumnDef }`.
- `DELETE /api/columns/:key` (manager/admin) — core columns rejected by store.
- `POST /api/export` (manager/admin) — `{ columnKeys: string[],
  employeeIds?: string[] }`; rows = requested ids ∩ visible ids (default: all
  visible); build an ExcelJS workbook in memory (sheet "Team", bold header
  row of column labels), respond with xlsx content-type +
  `Content-Disposition: attachment; filename=manageplus-export.xlsx`.

TeamPage UI: segmented Tree/Flat toggle (tree = expandable indented rows,
expanded by default; flat = plain table incl. a Mentor column showing the
mentor's name); columns driven by `GET /api/columns` (visible ones);
`mentorId` renders mentor name; `skills`/`projectHistory` render as `TagList`;
`growthStatus` as Badge with `growthTone`; name cell = Avatar + name, clicking
a row navigates to `/people/:id`. Search box filters by name/email/skill.
Actions: "Add person" (modal form incl. mentor select limited to visible
people + any custom columns), row edit/delete (icon buttons, ConfirmDialog on
delete), "Columns" modal (list with visibility toggles, up/down reorder,
rename, add custom column with type select, delete non-core), "Export" modal
(checkbox per column, pre-checked visible ones, optional "only selected rows"
if rows are checkbox-selected, calls `downloadFile`). Admin sees a scope
toggle (My tree / Everyone).

### B — Goals (`server/routes/goals.ts`, `src/pages/GoalsPage.tsx`)

- `GET /api/designations` (any) → `{ designations: string[] }` — union of
  DEFAULT_DESIGNATIONS, designations present on employees, and designations
  present in DesignationGoals; sorted.
- `GET /api/goals/designation` (any) → `{ goals: DesignationGoal[] }` (all).
- `POST /api/goals/designation` (manager/admin) — `{ designation, title,
  description?, category? }` → `{ goal }` (id: `newId('dg')`).
- `PATCH /api/goals/designation/:id`, `DELETE /api/goals/designation/:id`
  (manager/admin).
- `GET /api/employees/:id/goals` (assertCanView) → `{ designationGoals,
  individualGoals }` — designationGoals filtered to the employee's designation.
- `POST /api/employees/:id/goals` (assertCanManage) — `{ title, description?,
  category?, status?, targetDate? }` → `{ goal }` (id: `newId('ig')`).
- `PATCH /api/goals/individual/:id` (assertCanManage on the goal's employee)
  — any of title/description/category/status/targetDate → `{ goal }`.
- `DELETE /api/goals/individual/:id` (assertCanManage on goal's employee).

GoalsPage UI: two tabs. "Designation goals": designation picker (chips or
select) + card list of that designation's goals with category badge,
add/edit/delete via modal. "Individual goals": person picker (visible team,
not self for managers) + that person's effective goals — designation goals
shown read-only ("applies to all <designation>s") above their individual
goals with status badge (`statusTone`), target date, add/edit/delete, and a
status quick-cycle control. Make the layering obvious: common goals first,
individual goals labeled "on top".

### C — Review calendar (`server/routes/reviews.ts`, `src/pages/ReviewsPage.tsx`)

- `GET /api/reviews?year=2026` (manager/admin) → `{ cycles: ReviewCycleOut[] }`
  — cycles overlapping the year for visible employees (subtree; admin: all),
  joined with employeeName/designation.
- `POST /api/reviews` (assertCanManage on employeeId) — `{ employeeId, name,
  startDate, endDate, status?, notes? }`; validate start <= end. → `{ cycle }`
  (id `newId('rc')`).
- `PATCH /api/reviews/:id` (assertCanManage on the cycle's employee) — name/
  dates/status/rating/notes. When status becomes 'completed', rating (1-5)
  should be settable. → `{ cycle }`.
- `DELETE /api/reviews/:id` (assertCanManage) → `{ ok: true }`.
- `GET /api/employees/:id/reviews` (assertCanView) → `{ cycles: ReviewCycle[] }`
  sorted by startDate desc (used by PersonPage — keep the shape stable).

ReviewsPage UI: year switcher (‹ 2026 ›). Timeline grouped by month: a grid
with a row per team member (Avatar + name + designation) and 12 month columns
(Jan–Dec header); each cycle renders as a horizontal bar spanning its
start→end months, positioned proportionally within months, color-coded:
completed `var(--success)`, in_progress `var(--warning)`, not_started
`var(--danger)`; a subtle "today" vertical line. Bars are clickable →
detail modal (person, cycle name, dates, status badge, rating stars if
completed, notes) with edit/delete for managers + "New review cycle" header
action. Below the grid: a legend + status summary counts. Keep it clean —
this is the showpiece view. A `src/styles/reviews.css` file is fine.

### D — Feedback & progress (`server/routes/feedback.ts`, `src/pages/PersonPage.tsx`)

- `GET /api/employees/:id/feedback` (assertCanView) → `{ feedback:
  FeedbackOut[] }` sorted date desc (join authorName + goalTitle).
- `POST /api/employees/:id/feedback` (assertCanManage) — `{ type, text,
  skill?, goalId?, goalType?, rating?, date? }` (date defaults today,
  authorId = actor). Continuous feedback requires rating 1-5. → `{ feedback }`.
- `PATCH /api/feedback/:id` (author or admin only), `DELETE /api/feedback/:id`
  (author or admin).
- `GET /api/employees/:id/skillwill` (assertCanView) → `{ entries:
  SkillWillEntry[] }` sorted date asc.
- `POST /api/employees/:id/skillwill` (assertCanManage) — `{ skill: 1-10,
  will: 1-10, notes?, date? }` → `{ entry }`.
- `GET /api/skillwill/consolidated` (manager/admin) → `{ points: Array<{
  employee: EmployeeOut, skill, will, date }> }` — latest entry per visible
  employee (excluding actor).
- `GET /api/employees/:id/checkin` (assertCanView) → `CheckinStatus`
  (`store.checkinStatus`).

PersonPage UI (`/people/:id` — works for self-view AND manager-view; look at
`useAuth()` + the URL param; manager actions hidden unless
`me.role==='admin' || (me.role==='manager' && id !== me.employeeId)` — the
server still enforces): header with big Avatar, name, designation,
employeeId, email, mentor, growth badge, current project + skills chips.
Check-in banner: due/overdue state from `/checkin` (warning banner when due
within 14 days, danger when overdue) with "Log check-in" button (manager
only). Tabs:
- **Overview**: stat tiles (latest skill/will, last review rating, open
  goals count, feedback count) + skill–will quadrant chart (SVG, 0-10 axes,
  quadrant labels, dot per historical entry connected + latest emphasized)
  + recent feedback list.
- **Goals**: effective goals via `GET /api/employees/:id/goals` (read-only
  here; link to Goals page for managers).
- **Feedback**: full history (type badge, author, date, tagged-goal chip or
  "General", skill chip, rating stars for continuous) + "Add feedback" modal
  (type select; skill input when type=skill; goal tag select fetched from the
  goals endpoint — individual goals + designation goals, optional; rating
  input when type=continuous or performance) + edit/delete own entries.
- **Progress**: line chart (SVG) of skill & will over time + continuous
  check-in ratings over time (second chart or same panel), plus a "Log
  skill/will snapshot" action (manager only) and history table.
Charts: hand-rolled theme-aware SVG (`var(--accent)`, `var(--success)`,
grid lines `var(--border)`, labels `var(--text-secondary)`, 12px). Before
writing chart code, load the `dataviz` skill via the Skill tool if available;
if not, follow: axes with ~4 gridlines, no chartjunk, direct labels over
legends where possible, 160-220px tall, `viewBox` + width 100%.
A `src/styles/person.css` file is fine.

### E — Dashboard & Admin (`server/routes/dashboard.ts`, `src/pages/DashboardPage.tsx`, `src/pages/AdminPage.tsx`)

- `GET /api/dashboard` (any role) →
  ```ts
  {
    role: Role,
    // manager/admin (admin = across everyone they can see):
    teamSize?: number, directCount?: number,
    reviewCounts?: { completed: number; in_progress: number; not_started: number },
    nudges?: CheckinNudge[],          // overdue first, then due within 30 days
    upcomingReviews?: ReviewCycleOut[], // next 60 days, soonest first
    recentFeedback?: FeedbackOut[],   // last 5 given across the team (+ employeeName via `any` extension or a small inline type)
    growthSummary?: Record<string, number>, // growthStatus -> count
    // every role (about the actor themself):
    myCheckin?: CheckinStatus, myOpenGoals?: number, myNextReview?: ReviewCycle | null
  }
  ```
  Compute nudges with `store.checkinStatus` per visible employee (exclude the
  actor); include when overdueDays > -30. Sort overdue first.
- Admin data needs no extra endpoints — reuse `/api/employees?view=flat&scope=all`
  and PATCH/DELETE/POST from module A (they are mounted and admin-authorized
  even if module A is still building; code to the contract).

DashboardPage UI, manager/admin: greeting header ("Good morning, Siddhu" by
local time + date), stat tiles (team size, directs, reviews in progress,
overdue check-ins), "Check-in nudges" card — the reminder center: per person
Avatar, name, last check-in date, overdue N days (danger badge) / due in N
days (warning), button → `/people/:id`; "Upcoming reviews" card (name, cycle,
starts formatDate); "Team growth" card (growthStatus counts as badges);
"Recent feedback" card. Employee variant: greeting, own check-in status card,
open goals count, next review card, links to My Profile tabs.
AdminPage UI: flat table of ALL employees (name, id, email, designation,
mentor name, role badge, admin toggle) with add/edit/delete via modals
(reuses module A endpoints; PATCH `isAdmin` 'yes'/'no' toggle with
ConfirmDialog), plus stat tiles (total people, managers count, admins count,
designation breakdown). Keep it distinct from TeamPage: this is user
management, not day-to-day tree work.

## Ownership matrix

| Module | Owns (create/edit) |
| ------ | ------------------ |
| A | `server/routes/employees.ts`, `src/pages/TeamPage.tsx`, `src/styles/team.css` (opt) |
| B | `server/routes/goals.ts`, `src/pages/GoalsPage.tsx`, `src/styles/goals.css` (opt) |
| C | `server/routes/reviews.ts`, `src/pages/ReviewsPage.tsx`, `src/styles/reviews.css` (opt) |
| D | `server/routes/feedback.ts`, `src/pages/PersonPage.tsx`, `src/styles/person.css` (opt) |
| E | `server/routes/dashboard.ts`, `src/pages/DashboardPage.tsx`, `src/pages/AdminPage.tsx`, `src/styles/dashboard.css` (opt) |

Everything else is foundation — read it, don't write it.
