'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Idempotent: skip seeding if data already exists (handles container restarts)
  const existingOrg = await prisma.organization.findUnique({ where: { name: 'Acme Corp' } });
  if (existingOrg) {
    console.log('✅ Seed data already present — skipping.');
    return;
  }

  console.log('🌱 Seeding database...');

  const hash = (pw) => bcrypt.hash(pw, 10);

  // Organization
  const org = await prisma.organization.create({
    data: { name: 'Acme Corp' },
  });

  // Users
  const [admin, manager, member1, member2] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Alice Admin',
        email: 'admin@acme.com',
        passwordHash: await hash('Admin@1234'),
        role: 'ADMIN',
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Bob Manager',
        email: 'manager@acme.com',
        passwordHash: await hash('Manager@1234'),
        role: 'MANAGER',
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Carol Member',
        email: 'member1@acme.com',
        passwordHash: await hash('Member@1234'),
        role: 'MEMBER',
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Dave Member',
        email: 'member2@acme.com',
        passwordHash: await hash('Member@1234'),
        role: 'MEMBER',
        organizationId: org.id,
      },
    }),
  ]);

  // Project
  const project = await prisma.project.create({
    data: {
      name: 'Platform V2',
      description: 'Core platform rewrite',
      organizationId: org.id,
      createdById: admin.id,
    },
  });

  // Tasks
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        title: 'Set up CI/CD pipeline',
        description: 'Configure GitHub Actions for automated testing and deployment',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        assigneeId: member1.id,
        createdById: manager.id,
        projectId: project.id,
        organizationId: org.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Write API documentation',
        priority: 'MEDIUM',
        status: 'TODO',
        assigneeId: member2.id,
        createdById: manager.id,
        projectId: project.id,
        organizationId: org.id,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Fix login bug on Safari',
        priority: 'HIGH',
        status: 'BLOCKED',
        assigneeId: member1.id,
        createdById: admin.id,
        projectId: project.id,
        organizationId: org.id,
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // overdue — for analytics demo
      },
    }),
    prisma.task.create({
      data: {
        title: 'Onboarding flow redesign',
        priority: 'LOW',
        status: 'DONE',
        assigneeId: member2.id,
        createdById: manager.id,
        projectId: project.id,
        organizationId: org.id,
        completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  // Status history
  await prisma.taskStatusHistory.createMany({
    data: [
      { taskId: tasks[0].id, fromStatus: null,          toStatus: 'TODO',        changedById: manager.id },
      { taskId: tasks[0].id, fromStatus: 'TODO',        toStatus: 'IN_PROGRESS', changedById: member1.id },
      { taskId: tasks[2].id, fromStatus: null,          toStatus: 'TODO',        changedById: admin.id },
      { taskId: tasks[2].id, fromStatus: 'TODO',        toStatus: 'IN_PROGRESS', changedById: member1.id },
      { taskId: tasks[2].id, fromStatus: 'IN_PROGRESS', toStatus: 'BLOCKED',     changedById: manager.id, note: 'Waiting on Safari repro device' },
      { taskId: tasks[3].id, fromStatus: null,          toStatus: 'TODO',        changedById: manager.id },
      { taskId: tasks[3].id, fromStatus: 'TODO',        toStatus: 'IN_PROGRESS', changedById: member2.id },
      { taskId: tasks[3].id, fromStatus: 'IN_PROGRESS', toStatus: 'IN_REVIEW',   changedById: member2.id },
      { taskId: tasks[3].id, fromStatus: 'IN_REVIEW',   toStatus: 'DONE',        changedById: manager.id },
    ],
  });

  console.log(`✅ Seeded successfully:
  Organization : ${org.name}
  Users        : admin@acme.com | manager@acme.com | member1@acme.com | member2@acme.com
  Project      : ${project.name}
  Tasks        : ${tasks.length}

  🔑 Login credentials:
  Admin   : admin@acme.com    / Admin@1234
  Manager : manager@acme.com  / Manager@1234
  Member  : member1@acme.com  / Member@1234
  `);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
