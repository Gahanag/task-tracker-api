'use strict';

const { prisma } = require('../config/database');
const { Errors, ErrorCodes } = require('../utils/errors');

const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  isArchived: true,
  organizationId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tasks: true } },
};

async function createProject({ name, description }, requestingUser) {
  return prisma.project.create({
    data: {
      name,
      description,
      organizationId: requestingUser.organizationId,
      createdById: requestingUser.id,
    },
    select: PROJECT_SELECT,
  });
}

async function listProjects(requestingUser) {
  return prisma.project.findMany({
    where: { organizationId: requestingUser.organizationId },
    select: PROJECT_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

async function getProjectById(projectId, requestingUser) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: requestingUser.organizationId },
    select: PROJECT_SELECT,
  });
  if (!project) throw Errors.notFound('Project', ErrorCodes.PROJECT_NOT_FOUND);
  return project;
}

async function updateProject(projectId, updates, requestingUser) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: requestingUser.organizationId },
  });
  if (!project) throw Errors.notFound('Project', ErrorCodes.PROJECT_NOT_FOUND);

  return prisma.project.update({
    where: { id: projectId },
    data: updates,
    select: PROJECT_SELECT,
  });
}

async function deleteProject(projectId, requestingUser) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: requestingUser.organizationId },
  });
  if (!project) throw Errors.notFound('Project', ErrorCodes.PROJECT_NOT_FOUND);

  await prisma.project.delete({ where: { id: projectId } });
}

module.exports = { createProject, listProjects, getProjectById, updateProject, deleteProject };
