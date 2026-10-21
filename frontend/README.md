# Smart Lab Scheduling System — Frontend

React + TypeScript application scaffolded with Vite. This F02 foundation includes routing, query-state setup, Tailwind CSS v4, shadcn/ui configuration, and a smoke test. Feature pages and API integration are intentionally deferred to later frontend tasks.

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
