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

- `DATABASE_URL`
- `BACKEND_PORT`
- `FRONTEND_ORIGIN`

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
