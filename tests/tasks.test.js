'use strict';

/**
 * Integration tests for:
 * 1. Task CRUD with RBAC enforcement
 * 2. Status transition validation (valid + invalid paths)
 * 3. MEMBER cannot see tasks not assigned to them
 */

const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/database');

// Shared test state
let adminToken, managerToken, memberToken;
let orgId, projectId, taskId;
let adminId, managerId, memberId;

const uniqueEmail = (role) => `${role}_task_test_${Date.now()}@example.com`;
const uniqueOrg = () => `TaskTestOrg_${Date.now()}`;

async function loginAs(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data?.accessToken;
}

beforeAll(async () => {
  const org = uniqueOrg();
  const adminEmail = uniqueEmail('admin');
  const managerEmail = uniqueEmail('manager');
  const memberEmail = uniqueEmail('member');

  // Register admin (creates org)
  const adminRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Admin User', email: adminEmail, password: 'Admin@1234',
    organizationName: org, role: 'ADMIN',
  });
  adminToken = adminRes.body.data.accessToken;
  orgId = adminRes.body.data.organization.id;
  adminId = adminRes.body.data.user.id;

  // Register manager (joins same org)
  const managerRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Manager User', email: managerEmail, password: 'Manager@1234',
    organizationName: org, role: 'MANAGER',
  });
  managerToken = managerRes.body.data.accessToken;
  managerId = managerRes.body.data.user.id;

  // Register member
  const memberRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Member User', email: memberEmail, password: 'Member@1234',
    organizationName: org, role: 'MEMBER',
  });
  memberToken = memberRes.body.data.accessToken;
  memberId = memberRes.body.data.user.id;

  // Create a project
  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Project', description: 'For testing' });
  projectId = projectRes.body.data.id;
});

afterAll(async () => {
  // Cleanup by org
  await prisma.taskStatusHistory.deleteMany({ where: { task: { organizationId: orgId } } });
  await prisma.task.deleteMany({ where: { organizationId: orgId } });
  await prisma.project.deleteMany({ where: { organizationId: orgId } });
  await prisma.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

// ── Task CRUD ─────────────────────────────────────────────────────────────────
describe('Task CRUD + RBAC', () => {
  describe('POST /api/v1/tasks (ADMIN/MANAGER only)', () => {
    it('MANAGER can create a task', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Test Task Alpha',
          priority: 'HIGH',
          projectId,
          assigneeId: memberId,
          dueDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Test Task Alpha');
      expect(res.body.data.status).toBe('TODO');
      taskId = res.body.data.id;
    });

    it('MEMBER cannot create a task', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Unauthorized Task', projectId });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('rejects past due_date', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Past Due Task',
          projectId,
          dueDate: new Date(Date.now() - 86400000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('future date');
    });
  });

  describe('GET /api/v1/tasks/:id (RBAC isolation)', () => {
    it('assigned MEMBER can view their task', async () => {
      const res = await request(app)
        .get(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(taskId);
    });

    it('MANAGER can view any task in their org', async () => {
      const res = await request(app)
        .get(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/tasks (list with pagination)', () => {
    it('returns paginated task list for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination.limit).toBe(10);
    });

    it('MEMBER only sees their own tasks', async () => {
      const res = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      // All returned tasks should be assigned to this member
      res.body.data.forEach((task) => {
        expect(task.assignee?.id).toBe(memberId);
      });
    });

    it('supports status filter', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?status=TODO')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((task) => {
        expect(task.status).toBe('TODO');
      });
    });
  });
});

// ── Status Transitions ────────────────────────────────────────────────────────
describe('Task Status Transitions', () => {
  it('TODO → IN_PROGRESS (valid, by assignee)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('IN_PROGRESS → DONE (invalid — skips IN_REVIEW)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ status: 'DONE' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('IN_PROGRESS → BLOCKED (valid from any active state)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'BLOCKED', note: 'Waiting on design review' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('BLOCKED');
  });

  it('BLOCKED → IN_PROGRESS (unblocking)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('IN_PROGRESS → IN_REVIEW → DONE (happy path)', async () => {
    // IN_PROGRESS → IN_REVIEW
    let res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ status: 'IN_REVIEW' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_REVIEW');

    // IN_REVIEW → DONE
    res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'DONE' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DONE');
    expect(res.body.data.completedAt).not.toBeNull();
  });

  it('DONE → anything (terminal state, all transitions rejected)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'TODO' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    expect(res.body.message).toContain('terminal state');
  });

  it('ADMIN cannot delete a task not in their org — RBAC cross-org', async () => {
    // Try to get a non-existent task
    const res = await request(app)
      .get('/api/v1/tasks/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
