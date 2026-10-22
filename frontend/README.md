# Smart Lab Scheduling System — Frontend

React + TypeScript application scaffolded with Vite. F03 provides the shared shell and responsive navigation. F04 provides a typed REST client and services for all 40 backend operations. F05 connects `/data-master` to Flask for six master resources. F06 connects `/availability` for group/assistant allowlists. F07 connects `/constraint-studio` for explicit generate, preview, diagnostics, and save. The other three feature routes remain placeholders without automatic API requests.

## Requirements

- Node.js 24.13.0
- npm 11.6.2

## Local development

```powershell
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173` (strict port). The optional API base URL is configured in `.env.local` using `.env.example`; do not put secrets in frontend environment variables. No Vite proxy is configured.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

The production build is emitted to `dist/`, which is ignored by Git.

## Typed API client (F04)

The API base URL is read from `import.meta.env.VITE_API_BASE_URL`. Development falls back to `http://127.0.0.1:5000/api/v1`; production requires an explicit HTTP(S) URL at build time. Trailing slashes are normalized. Native `fetch` sends JSON for POST/PATCH/PUT and supports `AbortSignal` on every service. Importing services does not start requests.

Services return the full validated envelope: `{ data }`, or `{ data, meta }` for paginated lists. Zod validates response envelopes and DTO fields without coercing numbers/booleans. DTO objects tolerate additive data fields (which are omitted from the parsed DTO); ambiguous/invalid top-level envelopes are rejected. Numeric identifiers/revisions/counts must fit JavaScript's safe integer range; this is a client representation guard, not a new SQLite capacity limit. Writable payloads are typed separately, PATCH requires at least one field, and server validation remains authoritative.

| Service | Operations | Count |
|---|---|---:|
| `mataPraktikumApi` | `list`, `detail`, `create`, `update`, `setStatus` | 5 |
| `kelompokApi` | same five methods | 5 |
| `asistenApi` | same five methods | 5 |
| `laboratoriumApi` | same five methods | 5 |
| `slotWaktuApi` | same five methods | 5 |
| `praktikumApi` | same five methods; writes use FK IDs, reads include nested summaries | 5 |
| `availabilityApi.group`, `.assistant` | `get`, `replace` for each owner type | 4 |
| `scheduleApi` | `generate`, `save`, `active`, `history`, `historyDetail` | 5 |
| `healthApi` | `get` | 1 |

Master methods map to GET collection/detail, POST collection, PATCH detail, and PATCH `/{id}/status`. `replace` is PUT full replacement of `{ slot_ids }`; `[]` clears the allowlist. No DELETE, restore, export, or GET-preview operation is provided.

```ts
import { kelompokApi } from '@/api/services/master'
import { queryKeys } from '@/api/queryKeys'

// Pattern used by feature queries; keep unfinished placeholders request-free.
const options = {
  queryKey: queryKeys.master.list('kelompok', { page: 1, is_active: 'true' }),
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    kelompokApi.list({ page: 1, is_active: 'true' }, { signal }),
}
// const query = useQuery(options)
```

Query keys include resource/owner/ID/filter/page/sort and normalize omitted backend defaults. Availability owner keys distinguish groups and assistants. History defaults to `created_at desc`, while master lists default to `id asc`. `search` is supported only for the four named master resources. Values are URL-encoded; `%` and `_` are not expanded by the client.

The provider owns a stable QueryClient per mount. Automatic query/mutation retries, focus refetching, and polling are disabled. Queries can pass the supplied signal to services; mutations, especially generate/save, should remain explicit user actions. There are no optimistic updates or automatic cache clears.

After successful feature mutations, call the scoped helpers in `api/invalidation.ts`:

- `invalidateAfterMasterMutation(client, resource)` refreshes that resource, related nested praktikum summaries for subject/group/assistant mutations, and schedule reads whose statuses may change.
- `invalidateAfterAvailabilityMutation(client, ownerType, id)` refreshes only that availability owner and schedule reads.
- `invalidateAfterSave(client)` refreshes active/history reads. It retains existing cached data while invalidating it; it does not clear unrelated master data.

Entity responses do not expose whether revision changed. These helpers conservatively refresh schedule reads even for no-ops; they do not infer invalidation or rewrite server state. F07 must handle in-memory preview expiry/staleness separately. Do not persist previews in browser storage.

## Data Master (F05)

Run Flask separately using the root README instructions. `/data-master` uses the six F04 master services for server-paginated list/detail, create, partial PATCH, and confirmed activation/deactivation. There is no DELETE or optimistic mutation. Search is available only on the four named resources; status and common ID/timestamp sorting are server-side. Leaving a resource cancels its read requests.

Forms use React Hook Form and Zod, with backend validation authoritative. Participant counts and capacities must be positive safe integers. Slots use weekdays 1–5, `HH:MM`, and a same-day duration of 120 minutes; overlap is checked by Flask/SQLite. Praktikum choices are fetched from every page of the active reference catalogs, never hardcoded. An unchanged existing inactive FK can be retained during partial edit, but replacements must be active. Empty or failed reference catalogs block creation and provide guidance/retry.

Successful mutations invalidate scoped F04 query keys, including related nested Praktikum summaries and schedule reads. The page does not claim that a schedule became invalid from a master response, because that response does not expose schedule status. Unchanged edits send no PATCH. Activation does not imply dataset readiness or restore invalid schedules.

UI tests use mocked network responses and exercise all six resources, errors/retry, validation, pagination, reference catalogs, request cancellation, focus restoration, and scoped cache invalidation. HTTP integration was also checked with real Flask and an isolated temporary SQLite database using the actual F04 services; this is not browser E2E. Never use the main development database for automated mutation smoke tests.

## Resource Availability (F06)

`/availability` loads every page of active groups/assistants and the slot catalog through F04 services. Choose an owner explicitly; opening the page never performs a mutation. Slots are grouped only by days actually present, sorted by start/end time and ID, and rendered as keyboard-accessible checkboxes. Nonactive slots remain visible but disabled. Stored nonactive or missing slot IDs are disclosed and require explicit removal; they are never silently filtered from a draft.

An empty allowlist means unavailable, not all slots available. Save sends the complete sorted unique `slot_ids` array through PUT, including `[]` when explicitly cleared. The server response establishes the new baseline before scoped owner/schedule invalidation. There are no optimistic updates or automatic mutation retries. Success messages do not infer schedule invalidation from an availability response.

Server baseline and local draft are separate, with set-based dirty checking. Reset uses the most recently received server data. Refetch does not overwrite a draft: changed server data is disclosed and requires explicit acceptance before another save. Switching owner/type with unsaved changes requires confirmation. The app now uses React Router's existing data-router API (`createBrowserRouter`/`RouterProvider`) and `useBlocker`, covering internal links and history navigation. `AppProviders` owns QueryClient only; production router setup is in `main.tsx`, with shared route definitions in `app/routes.tsx`. Reload/close warnings use `beforeunload` only while dirty or saving; browser policy controls whether a generic dialog appears and does not allow custom warning text.

Owner/catalog refresh errors preserve the draft and block writes until data can be verified. Active owner membership is checked again immediately before PUT, although the backend itself permits inactive-owner availability operations. This is a UI safety check, not a lock: without an availability version token, concurrent edits remain last-write-wins and a deactivation can still race the preflight. HTTP/network failures may have an uncertain mutation outcome; never assume cancellation rolled back a write.

Component tests exercise GET/PUT, pagination, empty/error/retry states, full replacement, navigation blocking, late responses, stale catalogs, draft preservation, keyboard interaction, and targeted invalidation. Real Flask GET/PUT/CORS integration is checked against an isolated disposable SQLite database, not the main database. These checks are not browser E2E. Availability does not implement Constraint Studio, Timetable, History, or Overview.

## Constraint Studio (F07)

`/constraint-studio` performs no request on mount. Generate Schedule uses `scheduleApi.generate()` with `{}` and shows an indeterminate pending state, SAT preview, UNSAT, or a safe error. The displayed counts, assignments, source revision, and DEC-067 diagnostics come from the actual response. Rule definitions C01–C09 are not per-constraint test results. No readiness totals, progress percentages, search traces, or extra telemetry are fabricated.

Assignments use the nested names/IDs in the generated snapshot; there is no live-catalog lookup, pagination dependency, or risk of replacing historical labels with newer master names. An empty snapshot name is displayed as the original ID with an unavailable-name label. Assignment identity and content are not editable. UNSAT diagnostics use activity IDs when display names are not part of that response.

Generate and Save are separate non-retrying mutations. Save sends only the actual `preview_id`. A synchronous single-flight guard prevents rapid duplicate submissions and overlapping generate/save. Regeneration immediately discards the previous local result. Leaving/unmounting aborts the client request and ignores late callbacks for that page; this does not prove the backend cancelled or rolled back the operation. Preview is kept only in page memory, never browser storage, and is not restored from the mutation cache after remount. No GET-preview endpoint or solver polling is used.

Preview timestamps are displayed as backend UTC. A local one-second clock (no network polling) disables save after `expires_at` according to the device and refreshes on visibility change. This is only an expiry hint: backend time and revision checks remain authoritative, and an incorrect device clock may disable save prematurely. There is no invented countdown or client-side revision authority.

Confirmed save displays the returned version ID/status/revision and invalidates only active/history reads through the F04 helper. It removes the used preview from the local save path. `PREVIEW_EXPIRED`, `STALE_PREVIEW`, `PREVIEW_CONSUMED`, and `PREVIEW_NOT_FOUND` discard the local preview and require an explicit new generate. Known backend rejections such as `DATABASE_BUSY` retain the preview for an explicit retry if it has not expired. Transport, parsing, or protocol failures during save have an uncertain outcome: no success is claimed, no automatic retry occurs, and the local preview is no longer saveable. The user must verify persisted scheduling state before retrying an uncertain operation; Timetable/History UI integration remains deferred to F08/F09.

Component tests cover StrictMode idle behavior, SAT/UNSAT/errors, nested display and ID fallbacks, diagnostics, keyboard interaction, expiry, single-flight requests, late responses, regeneration, and targeted invalidation. Flask/SQLite/SWI-Prolog integration is checked on a disposable temporary database using the actual F04 services. HTTP tests and mocked component tests are not browser E2E.

## Scheduling and errors

`scheduleApi.generate()` always sends `{}`. Its `data` is a discriminated union: `status === 'success'` has required preview metadata, assignments, and diagnostics with verification `passed`; `unsatisfiable` has empty assignments, revision, diagnostics with `not_applicable`, and no preview. UNSAT HTTP 200 is a normal result. `save({ preview_id })` returns the active version; `active()` can return `{ data: null }`. History returns immutable snapshot metadata separately from display assignments, with no solver diagnostics. DTO validation checks shape, not CSP correctness.

`healthApi.get()` accepts both healthy HTTP 200 and degraded HTTP 503 data envelopes. It validates the HTTP/status/component combination. A normal backend error envelope on 503 still throws an ApiError.

`ApiError` from `api/errors.ts` contains `kind`, nullable HTTP `status`, nullable backend `code`, `message`, and `details` (object/array/null). Kinds distinguish:

- `backend`: non-2xx with a valid backend error envelope; preserves the server's public message/code/details.
- `http`: non-2xx without a valid error envelope, including HTML errors.
- `network`: fetch or response-stream transport failure.
- `aborted`: cancellation, including an already aborted signal.
- `parse`: successful HTTP response with malformed/empty JSON.
- `protocol`: a valid JSON success/accepted-health response with the wrong envelope or DTO shape.
- `request`: invalid API URL, unsafe entity ID, or an unserializable request body.

Render safe messages/field errors, never `.stack` or raw exceptions/response bodies. Non-backend failures use generic messages without response HTML, native exception text, payloads, or local paths. Cancellation can be handled silently. The client performs no retry itself. Aborting a browser request does not prove a backend mutation was cancelled or rolled back; do not automatically repeat generate/save after an uncertain outcome.

The implementation follows current Flask serializers and DEC-067. Earlier abbreviated generate examples omit diagnostics, and one Blueprint matrix row suggests invalid/archived versions could be returned by active; actual `active()` returns only an active version or null. Other statuses are read through history. No backend or contract files were changed by F04.
