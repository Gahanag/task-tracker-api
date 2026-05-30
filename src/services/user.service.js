'use strict';

const { prisma } = require('../config/database');
const { Errors, ErrorCodes } = require('../utils/errors');

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  organizationId: true,
  createdAt: true,
};

async function listUsers(requestingUser) {
  return prisma.user.findMany({
    where: { organizationId: requestingUser.organizationId },
    select: USER_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

async function getUserById(userId, requestingUser) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: requestingUser.organizationId },
    select: USER_SELECT,
  });
  if (!user) throw Errors.notFound('User', ErrorCodes.USER_NOT_FOUND);
  return user;
}

async function updateUserRole(userId, role, requestingUser) {
  // Cannot change your own role
  if (userId === requestingUser.id) {
    throw Errors.badRequest('You cannot change your own role.');
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: requestingUser.organizationId },
  });
  if (!user) throw Errors.notFound('User', ErrorCodes.USER_NOT_FOUND);

  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: USER_SELECT,
  });
}

async function updateUser(userId, updates, requestingUser) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: requestingUser.organizationId },
  });
  if (!user) throw Errors.notFound('User', ErrorCodes.USER_NOT_FOUND);

  return prisma.user.update({
    where: { id: userId },
    data: updates,
    select: USER_SELECT,
  });
}

async function deactivateUser(userId, requestingUser) {
  if (userId === requestingUser.id) {
    throw Errors.badRequest('You cannot deactivate your own account.');
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: requestingUser.organizationId },
  });
  if (!user) throw Errors.notFound('User', ErrorCodes.USER_NOT_FOUND);

  return prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
    select: USER_SELECT,
  });
}

module.exports = { listUsers, getUserById, updateUserRole, updateUser, deactivateUser };
