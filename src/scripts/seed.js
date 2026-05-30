'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');
  
  await prisma.taskStatusHistory.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({ data: { name: 'Acme Corp' } });
  const hash = (pw) => bcrypt.hash(pw, 10);

  const admin = await prisma.user.create({ data: { name: 'Alice Admin', email: 'admin@acme.com', passwordHash: await hash('Admin@1234'), role: 'ADMIN', organizationId: org.id } });
  const manager = await prisma.user.create({ data: { name: 'Bob Manager', email: 'manager@acme.com', passwordHash: await hash('Manager@1234'), role: 'MANAGER', organizationId: org.id } });
  const member1 = await prisma.user.create({ data: { name: 'Carol Member', email: 'member1@acme.com', passwordHash: await hash('Member@1234'), role: 'MEMBER', organizationId: org.id } });

  const project = await prisma.project.create({ data: { name: 'Platform V2', organizationId: org.id, createdById: admin.id } });

  await prisma.task.create({ data: { title: 'Setup CI/CD', priority: 'HIGH', status: 'IN_PROGRESS', assigneeId: member1.id, createdById: manager.id, projectId: project.id, organizationId: org.id, dueDate: new Date(Date.now() + 7*24*60*60*1000) } });
  await prisma.task.create({ data: { title: 'Write Docs', priority: 'MEDIUM', status: 'TODO', assigneeId: member1.id, createdById: manager.id, projectId: project.id, organizationId: org.id } });

  console.log('Seeded! admin@acme.com / Admin@1234');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.());
