# Backend Service

This folder contains the extracted backend API service for the app.

## Run

From this directory:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run prisma:push`
- `npm run admin:ensure`

From the repo root:

- `npm run dev:backend`

The backend reads:

- `DATABASE_URL` (for PostgreSQL)
- `D1_ACCOUNT_ID` (for Cloudflare D1)
- `D1_DATABASE_NAME` (for Cloudflare D1)
- `CLOUDFLARE_API_TOKEN` (for Cloudflare D1)
- `BACKEND_PORT`
- `FRONTEND_ORIGIN`

If `D1_ACCOUNT_ID`, `D1_DATABASE_NAME`, and `CLOUDFLARE_API_TOKEN` are provided, the backend will use Cloudflare D1 via the Cloudflare D1 query API. Otherwise it falls back to PostgreSQL using `DATABASE_URL`.

## D1 schema

If you are deploying with D1, use `backend/d1-schema.sql` to create the required tables.

## Endpoints

- `GET /health`
- `POST /api/uploads`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/users/:id`
- `POST /api/users/:id/subscription/toggle`
- `GET /api/videos`
- `GET /api/videos/:id`
- `POST /api/videos`
- `DELETE /api/videos/:id`

## Media uploads

- Uploaded files are stored in `backend/uploads/`.
- Files are served from `/uploads/...` on the backend origin.
- The frontend admin upload flow depends on `BACKEND_URL` pointing at this backend service.
