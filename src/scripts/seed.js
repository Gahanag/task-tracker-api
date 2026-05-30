"use strict";
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  await prisma.taskStatusHistory.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({ data: { name: "Acme Corp" } });
  const hash = (pw) => bcrypt.hash(pw, 10);

  const admin = await prisma.user.create({ data: { name: "Alice Admin", email: "admin@acme.com", passwordHash: await hash("Admin@1234"), role: "ADMIN", organizationId: org.id } });
  const manager = await prisma.user.create({ data: { name: "Bob Manager", email: "manager@acme.com", passwordHash: await hash("Manager@1234"), role: "MANAGER", organizationId: org.id } });
  const member1 = await prisma.user.create({ data: { name: "Carol Member", email: "member1@acme.com", passwordHash: await hash("Member@1234"), role: "MEMBER", organizationId: org.id } });
  const member2 = await prisma.user.create({ data: { name: "Dave Member", email: "member2@acme.com", passwordHash: await hash("Member@1234"), role: "MEMBER", organizationId: org.id } });

  const project = await prisma.project.create({ data: { name: "Platform V2", description: "Core platform rewrite", organizationId: org.id, createdById: admin.id } });

  await prisma.task.create({ data: { title: "Setup CI/CD", priority: "HIGH", status: "IN_PROGRESS", assigneeId: member1.id, createdById: manager.id, projectId: project.id, organizationId: org.id, dueDate: new Date(Date.now() + 7*24*60*60*1000) } });
  await prisma.task.create({ data: { title: "Write API Docs", priority: "MEDIUM", status: "TODO", assigneeId: member2.id, createdById: manager.id, projectId: project.id, organizationId: org.id } });
  await prisma.task.create({ data: { title: "Fix Safari Bug", priority: "HIGH", status: "BLOCKED", assigneeId: member1.id, createdById: admin.id, projectId: project.id, organizationId: org.id } });
  await prisma.task.create({ data: { title: "Onboarding Redesign", priority: "LOW", status: "DONE", assigneeId: member2.id, createdById: manager.id, projectId: project.id, organizationId: org.id, completedAt: new Date() } });

  console.log("Seeded OK - admin@acme.com / Admin@1234");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());