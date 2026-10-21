# Smart Lab Scheduling System — Frontend

React + TypeScript application scaffolded with Vite. F03 provides the shared shell, six placeholder routes, and responsive navigation. F04 provides a typed REST client and services for all 40 backend operations. Feature UI integration is deferred; the placeholders make no API requests.

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

// Future feature usage with useQuery; do not add this to F03 placeholders.
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
