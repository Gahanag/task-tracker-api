'use strict';

/**
 * Integration tests for Auth flow:
 * 1. Register → Login → Access protected route
 * 2. Refresh token rotation
 * 3. Reject reused refresh token (replay attack)
 */

const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/database');

// Test users
const testUser = {
  name: 'Test User',
  email: `test_${Date.now()}@example.com`,
  password: 'Test@1234',
  organizationName: `TestOrg_${Date.now()}`,
  role: 'ADMIN',
};

let accessToken, refreshToken, userId;

describe('Auth Flow', () => {
  afterAll(async () => {
    // Cleanup test data
    if (userId) {
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { email: testUser.email } });
    }
    await prisma.$disconnect();
  });

  // ── 1. Register ─────────────────────────────────────────────────────────────
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(201);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
      userId = res.body.data.user.id;
    });

    it('should reject duplicate email registration', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'other@test.com', password: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'x@y.com' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── 2. Login ─────────────────────────────────────────────────────────────────
  describe('POST /api/v1/auth/login', () => {
    it('should login and return tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      // Update tokens for subsequent tests
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'WrongPass@1' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'Test@1234' });

      expect(res.status).toBe(401);
    });
  });

  // ── 3. Protected route access ─────────────────────────────────────────────
  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testUser.email);
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_MISSING');
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalidtoken.here.xyz');
      expect(res.status).toBe(401);
    });
  });

  // ── 4. Refresh token rotation ─────────────────────────────────────────────
  describe('POST /api/v1/auth/refresh', () => {
    it('should issue new token pair and rotate refresh token', async () => {
      const oldRefreshToken = refreshToken;

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      // New tokens should differ from old
      expect(res.body.data.accessToken).not.toBe(accessToken);
      expect(res.body.data.refreshToken).not.toBe(oldRefreshToken);

      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should reject replayed (already used) refresh token', async () => {
      const currentRefreshToken = refreshToken;

      // Use it once (valid)
      await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      // Use again (replay attack) — should be rejected
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.code).toBe('REFRESH_TOKEN_INVALID');
    });
  });
});
