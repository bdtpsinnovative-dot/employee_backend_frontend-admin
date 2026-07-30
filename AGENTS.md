# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Go backend and React + TypeScript admin UI. The backend API is a shared contract consumed by both this React app and a separate Flutter app.

- `backend/cmd/api` starts the API; `internal/handler`, `internal/service`, and `internal/repository` contain the main backend layers.
- `backend/internal/domain` contains shared models, and `backend/migrations` contains SQL schema changes.
- `frontend-admin/src/pages` contains screens; `src/components`, `src/services`, `src/api.ts`, and `src/utils` contain reusable UI, API clients, and helpers.

## Shared API Contract

Treat every API change as a cross-client change. Before modifying routes, payloads, validation, status codes, authentication, or error formats, inspect React callers and the Flutter app’s expected behavior. Prefer additive, backward-compatible changes; do not rename or remove fields without coordinating both clients. Check loading, empty, error, and permission states so a backend change does not silently break either app.

## Build, Test, and Development Commands

Run backend commands from `backend/`:

```sh
go run ./cmd/api          # start the API locally
go test ./...              # run Go tests
gofmt -w path/to/file.go   # format changed Go files
docker compose up --build  # build and run the API container
```

Run frontend commands from `frontend-admin/`:

```sh
npm ci             # install lockfile-pinned dependencies
npm run dev        # start Vite with hot reload
npm run build      # type-check and create a production build
npm run lint       # run Oxlint
```

## Coding Style & Naming Conventions

Use `gofmt` and idiomatic Go names: `PascalCase` for exported identifiers and `camelCase` for locals. Keep handlers, services, and repositories focused. In the frontend, use two-space indentation, typed API boundaries, `PascalCase` for components/pages, and `camelCase` for functions and variables. Prefer existing shared styles and components.

## Testing Guidelines

Go tests use `_test.go` files beside the code; run `go test ./...`. Frontend validation uses `npm run lint` and `npm run build`. API changes should check both client contracts.

## Commit & Pull Request Guidelines

Use short, imperative subjects with existing prefixes, such as `feat: ...`, `fix: ...`, or `style: ...`. Keep unrelated changes separate. Pull requests should describe user/API impact, migrations or configuration changes, and screenshots for UI changes. For API work, explicitly state React and Flutter impact and the compatibility plan.

## Security & Configuration Tips

The backend requires `PORT`, `SUPABASE_DATABASE_URL` (or `DATABASE_URL`), and `SUPABASE_JWT_SECRET`. Use local `.env` files or deployment secrets, never hard-code credentials, and review migrations carefully because they modify shared database state.
