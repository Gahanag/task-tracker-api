# Team Task Tracker API

A production-ready REST API for team-based task management with JWT authentication, role-based access control, Redis caching, and full Docker containerization.

---

## Quick Start

```bash
git clone <repo-url>
cd task-tracker-api
docker compose up --build
```

That's it. The API is available at **http://localhost:3000**

- Swagger UI: http://localhost:3000/api-docs
- Health check: http://localhost:3000/health

On first boot, the `migrate` container automatically runs DB migrations and seeds test data.

### Seed Credentials

| Role    | Email                | Password       |
|---------|----------------------|----------------|
| ADMIN   | admin@acme.com       | Admin@1234     |
| MANAGER | manager@acme.com     | Manager@1234   |
| MEMBER  | member1@acme.com     | Member@1234    |

---

## Architecture

```
src/
├── config/          # DB (Prisma), Redis, Logger
├── controllers/     # Thin — parse req, call service, send response
├── middleware/      # auth.middleware, rbac.middleware, validate.middleware, error.middleware
├── models/          # Defined via Prisma schema
├── routes/          # Express routers — wire middleware + controllers
├── services/        # Business logic — auth, task, user, project, analytics
├── utils/           # AppError, JWT helpers, status transitions, response helpers
└── validators/      # Joi schemas per domain
```

**Key principle:** RBAC is enforced entirely at the middleware and service layer — never inside controller logic. Controllers only marshal data; services own business rules.

---

## API Endpoints

### Auth
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/v1/auth/register` | Public | Register user + create/join org |
| POST | `/api/v1/auth/login` | Public | Login, get access + refresh token |
| POST | `/api/v1/auth/refresh` | Public | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Public | Revoke refresh token |
| GET  | `/api/v1/auth/me` | All roles | Get current user |

### Tasks
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/api/v1/tasks` | All roles | List tasks (paginated, filterable) |
| POST   | `/api/v1/tasks` | ADMIN, MANAGER | Create task |
| GET    | `/api/v1/tasks/:id` | All roles | Get task detail + history |
| PUT    | `/api/v1/tasks/:id` | ADMIN, MANAGER | Update task metadata |
| PATCH  | `/api/v1/tasks/:id/status` | Assignee, MANAGER, ADMIN | Advance status |
| DELETE | `/api/v1/tasks/:id` | ADMIN | Delete task |

### Projects
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/api/v1/projects` | All roles | List org projects |
| POST   | `/api/v1/projects` | ADMIN, MANAGER | Create project |
| GET    | `/api/v1/projects/:id` | All roles | Get project |
| PUT    | `/api/v1/projects/:id` | ADMIN, MANAGER | Update project |
| DELETE | `/api/v1/projects/:id` | ADMIN | Delete project |

### Users
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/api/v1/users` | ADMIN, MANAGER | List org users |
| GET    | `/api/v1/users/:id` | ADMIN, MANAGER | Get user |
| PATCH  | `/api/v1/users/:id/role` | ADMIN | Change user role |
| PATCH  | `/api/v1/users/:id` | ADMIN | Update name/status |
| DELETE | `/api/v1/users/:id` | ADMIN | Deactivate user |

### Analytics (Bonus)
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/v1/analytics` | ADMIN, MANAGER | Overdue counts + avg completion time |

---

## Role-Based Access Control

RBAC is implemented as Express middleware (`src/middleware/rbac.middleware.js`) and applied at the **route definition level** — not inside controller or service logic.

```
ADMIN   → full access: users, projects, tasks, analytics
MANAGER → projects, tasks, analytics; cannot manage users
MEMBER  → view + status-update only on tasks assigned to them
```

Organization isolation is enforced on every request — a user can never access resources from another organization, regardless of their role.

---

## Status Transition State Machine

```
TODO → IN_PROGRESS → IN_REVIEW → DONE (terminal)
  ↘         ↘            ↘
   BLOCKED ←──────────────── (reachable from any active state)
   BLOCKED → TODO / IN_PROGRESS / IN_REVIEW (unblock to any active state)
```

Transitions are validated server-side in `src/utils/statusTransitions.js`. Any invalid transition returns:

```json
{
  "status": 400,
  "code": "INVALID_STATUS_TRANSITION",
  "message": "Invalid status transition: IN_PROGRESS → DONE. Allowed: IN_REVIEW, BLOCKED"
}
```

**Who can transition:** Only the task assignee OR a MANAGER/ADMIN can advance a task's status.

---

## Caching Strategy

### What is cached
- **Task list results** — keyed by `task_list:<orgId>:<assigneeId>:<status>:<priority>:<page>:<limit>`
- **Single task detail** — keyed by `task:<taskId>` (short TTL: 2 minutes)

Task list TTL defaults to **5 minutes** (configurable via `REDIS_TTL_SECONDS`).

### Invalidation approach

On any write operation (create / update / delete / status change):

1. **Broad invalidation** using Redis `SCAN` + `DEL` on pattern `task_list:<orgId>:*`  
   This invalidates *all* task list caches for the organization. The tradeoff is simplicity and correctness over granularity — no risk of stale lists.

2. **Single task cache** (`task:<id>`) is deleted individually on that task's update.

`SCAN` is used instead of `KEYS` to avoid blocking the Redis event loop on large key sets.

### Why broad invalidation?

The alternative (tag-based / targeted invalidation) would track exactly which cache keys contain a given task and only delete those. This is more efficient but significantly more complex. For the expected scale of this system (tens of tasks per user, hundreds per org), the broad approach is correct, operationally simple, and has negligible performance cost.

**Failure mode:** If Redis is unavailable, all cache operations are silently skipped (log warning only). The API falls through to PostgreSQL — degraded performance, but no downtime.

---

## Database Design

### Schema Summary

```
Organization (1) ──── (N) User
Organization (1) ──── (N) Project
Project (1) ──────── (N) Task
User (1) ─────────── (N) Task [as assignee]
User (1) ─────────── (N) Task [as creator]
Task (1) ─────────── (N) TaskStatusHistory
User (1) ─────────── (N) RefreshToken
```

### Design Decision: Composite Indexes

The most important design decision was the choice of **composite indexes over single-column indexes** on the `tasks` table:

```sql
-- Primary query pattern: "tasks for this assignee, filtered by status"
CREATE INDEX tasks_assignee_id_status_idx ON tasks(assignee_id, status);

-- Manager query: "all tasks in a project, filtered by status"
CREATE INDEX tasks_project_id_status_idx ON tasks(project_id, status);
```

**Reason:** The task list endpoint almost always queries by `(assignee_id + status)` together. A composite index on both columns allows PostgreSQL to satisfy the entire WHERE clause from the index — an "index-only scan" — without touching the heap. A separate index on each column would require a less efficient bitmap scan merge. The `assignee_id` column is placed first because it has higher cardinality (many distinct users), giving better selectivity before the status filter.

The `due_date` index is single-column because it is used independently for analytics (overdue queries) and ORDER BY clauses, not in combination with other filters.

### Soft Deletes

Users are soft-deleted (`isActive = false`) rather than hard-deleted. This preserves `created_by` and `changed_by` foreign key references in task history — important for audit trails. Hard deletes would require either `ON DELETE SET NULL` (losing attribution) or cascading deletes (losing history).

---

## Error Response Format

All errors follow a consistent shape:

```json
{
  "status": 400,
  "code": "VALIDATION_ERROR",
  "message": "due_date must be a future date"
}
```

Error codes are defined centrally in `src/utils/errors.js` — `VALIDATION_ERROR`, `INVALID_STATUS_TRANSITION`, `INSUFFICIENT_ROLE`, `CROSS_ORG_ACCESS`, `TOKEN_EXPIRED`, etc.

---

## Refresh Token Security

Refresh token rotation is implemented with **replay attack detection**:

1. On each `/auth/refresh` call, the old token is **revoked** (marked in DB) and a new pair is issued.
2. If a **revoked** token is presented again (replay attack), the system **revokes ALL active refresh tokens** for that user, forcing a re-login. This is the standard "refresh token family" approach.

---

## Running Tests

```bash
# Requires a running PostgreSQL and Redis (use docker compose first)
docker compose up postgres redis -d
npm install
npx prisma migrate deploy
npm test
```

Tests cover:
- **Auth flow**: register, login, token refresh, replay attack prevention
- **Task RBAC + transitions**: all valid/invalid status paths, role enforcement, org isolation

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Validation | Joi |
| Logging | Winston |
| Container | Docker + Docker Compose |
| Testing | Jest + Supertest |
| Docs | OpenAPI 3.0 (Swagger UI) |

---

## What I Would Improve Given More Time

### Performance
- **Tag-based cache invalidation** — instead of broad `task_list:<orgId>:*` pattern deletion, maintain a reverse index of cache keys per task so only affected pages are invalidated
- **User profile caching in Redis** — currently every authenticated request hits PostgreSQL to validate the user; a short-lived Redis cache (60s TTL) for the user object would significantly reduce DB load under high traffic
- **Database connection pooling** — configure PgBouncer in front of PostgreSQL for production deployments

### Features
- **WebSocket/SSE real-time notifications** — notify assignees when their task status changes (partially designed — the status history write is the natural hook point)
- **Audit log endpoint** — expose `TaskStatusHistory` as a first-class API endpoint with filtering
- **Bulk operations** — bulk assign, bulk status update for manager efficiency
- **Task comments/attachments** — natural extension of the task model
- **Email notifications** — via a job queue (BullMQ + Redis) on status changes

### Security
- **Access token blacklisting** — currently access tokens are valid until expiry even after logout; a Redis-based token blacklist would fix this
- **Per-organization rate limiting** — current rate limiting is global; per-org limits would be fairer
- **API key support** — for service-to-service access without user sessions

### Operations
- **Structured JSON logging** — switch Winston to JSON format for log aggregation (Datadog, ELK)
- **Prometheus metrics endpoint** — expose request rates, cache hit ratio, DB query latency
- **Database backup automation** — pg_dump scheduled via cron in the compose setup
- **Horizontal scaling** — Redis pub/sub or a message broker (RabbitMQ) for cache invalidation across multiple API instances

### Testing
- **Contract tests** with Pact for API consumer-driven contracts
- **Load tests** with k6 to validate caching effectiveness under concurrent reads
- **Full integration test suite** — currently 2 test files cover critical paths; expand to full coverage of all endpoints and edge cases
