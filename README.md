# Dev Pulse

Dev Pulse is a GitHub activity dashboard with a React client, an Express API, PostgreSQL, Redis, BullMQ sync jobs, and WebSocket live updates.

## Environment

Create a `.env` file in the repo root before running Docker.

| Variable | Description | Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by the backend | `postgres://devpulse:devpulse@postgres:5432/devpulse` |
| `REDIS_URL` | Redis connection string used by API, workers, and WebSockets | `redis://redis:6379` |
| `JWT_SECRET` | Secret used to sign app JWTs | `change-me` |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID | `Iv1...` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret | `...` |
| `GITHUB_REDIRECT_URI` | GitHub OAuth callback URL | `http://localhost:3000/api/auth/github/callback` |
| `FRONTEND_URL` | Public frontend URL used after OAuth callback | `http://localhost` |
| `TOKEN_ENCRYPTION_KEY` | 32-character key for encrypting GitHub access tokens | `12345678901234567890123456789012` |
| `PORT` | Backend HTTP port | `3000` |
| `NODE_ENV` | Runtime mode | `production` |
| `LOG_LEVEL` | Backend log level | `info` |

## Run With Docker

```bash
docker compose up --build
```

The client is served at `http://localhost` and proxies `/api` and `/ws` to the backend container.

## Run Migrations

After the containers are built and the database is healthy, run:

```bash
docker compose exec backend npm run db:migrate
```

For a fresh deployment, run migrations before using the app.

## Local Development

Run infrastructure:

```bash
docker compose up postgres redis
```

Run the backend:

```bash
cd backend
npm install
npm run build
npm run db:migrate
npm run dev
```

Run the client:

```bash
cd client
npm install
npm run dev
```
