# Commerce Operations SaaS

Commerce Operations SaaS is a multi-tenant operations platform. The current repository contains only the Phase 1 foundation: tenant-aware authentication, authorization primitives, PostgreSQL/Prisma identity data, health checks, and a minimal Next.js portal. Business modules and external provider integrations are intentionally not included yet.

## Architecture

`Next.js (apps/web) → NestJS REST API (apps/api) → PostgreSQL`

The browser only receives the public API URL. Database, authentication, and future provider credentials stay in the API environment.

## Prerequisites

- Node.js 24 or later
- npm 10 or later
- Docker Desktop for the local PostgreSQL container

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment files. These files are ignored by Git.

   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

   Replace both JWT placeholder values with unique secrets of at least 32 characters. Keep the root and API database/JWT settings aligned.

3. Start PostgreSQL:

   ```bash
   npm run db:up
   ```

4. Generate the Prisma client and apply the initial migration:

   ```bash
   npm run prisma:generate -w @commerce/api
   npm run prisma:migrate -w @commerce/api -- --name init
   ```

5. Run both applications:

   ```bash
   npm run dev
   ```

   The portal runs at `http://localhost:3000`; the API is at `http://localhost:3001/api/v1`; Swagger is at `http://localhost:3001/docs`.

## Independent application startup

After completing the database setup, use either command independently:

```bash
npm run dev:api
npm run dev:web
```

The API uses `apps/api/.env`. The portal uses `apps/web/.env`; only `NEXT_PUBLIC_API_URL` belongs there and it must never contain a secret.

## Validation commands

```bash
npm run lint
npm run test
npm run build
```

## Docker

Docker Compose starts the API, web portal, and PostgreSQL:

```bash
docker compose up --build
```

The API container applies committed Prisma migrations before it starts. Docker uses the root `.env`; do not commit that file.

## Current foundation capabilities

- Tenant, user, membership, refresh-token, and tenant audit-log schema
- JWT access/refresh authentication with Argon2id password hashing
- Tenant context embedded in the signed access token
- Role/permission guard primitives
- API request validation, CORS, security headers, structured logging, Swagger, and health endpoints
- Minimal JavaScript-only Next.js sign-in and protected dashboard shell
