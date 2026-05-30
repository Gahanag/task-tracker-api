'use strict';

const { prisma } = require('../config/database');
const { cache, CacheKeys } = require('../config/redis');
const { validateTransition } = require('../utils/statusTransitions');
const { Errors, ErrorCodes } = require('../utils/errors');

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  projectId: true,
  organizationId: true,
  assignee: { select: { id: true, name: true, email: true, role: true } },
  createdBy: { select: { id: true, name: true, email: true } },
};

// ─── Create Task ──────────────────────────────────────────────────────────────
async function createTask({ title, description, priority, assigneeId, projectId, dueDate }, requestingUser) {
  // Verify project belongs to user's org
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.organizationId !== requestingUser.organizationId) {
    throw Errors.notFound('Project', ErrorCodes.PROJECT_NOT_FOUND);
  }

  // Verify assignee belongs to same org
  if (assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assigneeId, organizationId: requestingUser.organizationId, isActive: true },
    });
    if (!assignee) {
      throw Errors.badRequest('Assignee must be an active member of your organization.', ErrorCodes.INVALID_ASSIGNEE);
    }
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      priority,
      assigneeId,
      projectId,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: requestingUser.id,
      organizationId: requestingUser.organizationId,
    },
    select: TASK_SELECT,
  });

  // Create initial status history entry
  await prisma.taskStatusHistory.create({
    data: {
      taskId: task.id,
      fromStatus: null,
      toStatus: 'TODO',
      changedById: requestingUser.id,
    },
  });

  // Invalidate task list caches for this org and assignee
  await _invalidateTaskCaches(requestingUser.organizationId, assigneeId);

  return task;
}

// ─── Get Task By ID ───────────────────────────────────────────────────────────
async function getTaskById(taskId, requestingUser) {
  const cacheKey = CacheKeys.task(taskId);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { ...TASK_SELECT, statusHistory: {
      orderBy: { changedAt: 'desc' },
      take: 10,
      select: {
        fromStatus: true, toStatus: true, changedAt: true, note: true,
        changedBy: { select: { id: true, name: true } },
      },
    }},
  });

  if (!task) throw Errors.notFound('Task', ErrorCodes.TASK_NOT_FOUND);

  // RBAC: MEMBER can only view tasks assigned to them
  if (requestingUser.role === 'MEMBER' && task.assignee?.id !== requestingUser.id) {
    throw Errors.forbidden('You can only view tasks assigned to you.');
  }

  // Org isolation
  if (task.organizationId !== requestingUser.organizationId) {
    throw Errors.forbidden('Task belongs to a different organization.', ErrorCodes.CROSS_ORG_ACCESS);
  }

  await cache.set(cacheKey, task, 120); // Short TTL for single task
  return task;
}

// ─── List Tasks ───────────────────────────────────────────────────────────────
async function listTasks(queryParams, requestingUser) {
  const { page = 1, limit = 20, status, priority, assigneeId, projectId, sortBy = 'createdAt', sortOrder = 'desc' } = queryParams;

  // MEMBER can only see their own tasks — enforce assigneeId filter
  const effectiveAssigneeId = requestingUser.role === 'MEMBER'
    ? requestingUser.id
    : assigneeId;

  // Cache key encodes all filter params
  const cacheKey = CacheKeys.taskList(requestingUser.organizationId, {
    assigneeId: effectiveAssigneeId,
    status,
    priority,
    page,
    limit,
  });

  const cached = await cache.get(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const where = {
    organizationId: requestingUser.organizationId,
    ...(status && { status }),
    ...(priority && { priority }),
    ...(effectiveAssigneeId && { assigneeId: effectiveAssigneeId }),
    ...(projectId && { projectId }),
  };

  const [tasks, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      skip: (page - 1) * limit,
      take: parseInt(limit),
      orderBy: { [sortBy]: sortOrder },
      select: TASK_SELECT,
    }),
    prisma.task.count({ where }),
  ]);

  const result = { tasks, total, page: parseInt(page), limit: parseInt(limit) };
  await cache.set(cacheKey, result);

  return result;
}

// ─── Update Task ──────────────────────────────────────────────────────────────
async function updateTask(taskId, updates, requestingUser) {
  const task = await _getTaskOrThrow(taskId, requestingUser);

  // MEMBER cannot update task metadata (only status via separate endpoint)
  if (requestingUser.role === 'MEMBER') {
    throw Errors.forbidden('Members cannot update task details. Use status update endpoint.');
  }

  if (updates.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: updates.assigneeId, organizationId: requestingUser.organizationId, isActive: true },
    });
    if (!assignee) {
      throw Errors.badRequest('Assignee must be an active member of your organization.', ErrorCodes.INVALID_ASSIGNEE);
    }
  }

  if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: updates,
    select: TASK_SELECT,
  });

  await _invalidateTaskCaches(requestingUser.organizationId, taskId);

  return updated;
}

// ─── Update Task Status ───────────────────────────────────────────────────────
async function updateTaskStatus(taskId, { status: newStatus, note }, requestingUser) {
  const task = await _getTaskOrThrow(taskId, requestingUser);

  // Permission: only assignee or MANAGER/ADMIN can advance status
  const isAssignee = task.assigneeId === requestingUser.id;
  const isManagerOrAbove = ['MANAGER', 'ADMIN'].includes(requestingUser.role);

  if (!isAssignee && !isManagerOrAbove) {
    throw Errors.forbidden('Only the task assignee or a Manager/Admin can update task status.');
  }

  validateTransition(task.status, newStatus); // Throws if invalid

  const completedAt = newStatus === 'DONE' ? new Date() : (task.status === 'DONE' ? null : task.completedAt);

  const [updated] = await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus, completedAt },
      select: TASK_SELECT,
    }),
    prisma.taskStatusHistory.create({
      data: {
        taskId,
        fromStatus: task.status,
        toStatus: newStatus,
        changedById: requestingUser.id,
        note,
      },
    }),
  ]);

  await _invalidateTaskCaches(requestingUser.organizationId, task.assigneeId, null, taskId);

  return updated;
}

// ─── Delete Task ──────────────────────────────────────────────────────────────
async function deleteTask(taskId, requestingUser) {
  const task = await _getTaskOrThrow(taskId, requestingUser);

  // Only ADMIN can delete tasks
  if (requestingUser.role !== 'ADMIN') {
    throw Errors.forbidden('Only Admins can delete tasks.');
  }

  await prisma.task.delete({ where: { id: taskId } });
  await _invalidateTaskCaches(requestingUser.organizationId, task.assigneeId, null, taskId);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function _getTaskOrThrow(taskId, requestingUser) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { ...TASK_SELECT, assigneeId: true },
  });

  if (!task) throw Errors.notFound('Task', ErrorCodes.TASK_NOT_FOUND);
  if (task.organizationId !== requestingUser.organizationId) {
    throw Errors.forbidden('Task belongs to a different organization.', ErrorCodes.CROSS_ORG_ACCESS);
  }

  return task;
}

/**
 * Cache Invalidation Strategy:
 * On any task write (create/update/delete/status change):
 *   1. Delete the specific task detail cache (task:<id>)
 *   2. Delete ALL task list caches for the org (task_list:<orgId>:*)
 *      — This is a broad invalidation but safe. Given Redis SCAN is non-blocking,
 *        this avoids serving stale list results while keeping implementation simple.
 *
 * Alternative: tag-based invalidation (more granular) — noted in README as improvement.
 */
/**
 * @param {string} orgId
 * @param {string|null} [taskId] - specific task to also evict from single-task cache
 */
async function _invalidateTaskCaches(orgId, taskId = null) {
  const promises = [
    cache.delPattern(CacheKeys.taskListPattern(orgId)),
  ];
  if (taskId) {
    promises.push(cache.del(CacheKeys.task(taskId)));
  }
  await Promise.all(promises);
}

module.exports = { createTask, getTaskById, listTasks, updateTask, updateTaskStatus, deleteTask };
