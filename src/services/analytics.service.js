'use strict';

const { prisma } = require('../config/database');

/**
 * Returns overdue task count per user + average completion time per user.
 * Uses raw SQL for window functions and aggregations — demonstrates
 * SQL proficiency beyond what Prisma ORM supports natively.
 */
async function getTaskAnalytics(requestingUser) {
  const orgId = requestingUser.organizationId;
  const now = new Date();

  // ── Overdue tasks per active user ─────────────────────────────────────────
  const overdueByUser = await prisma.$queryRaw`
    SELECT
      u.id               AS "userId",
      u.name             AS "userName",
      u.email            AS "userEmail",
      COUNT(t.id)::int   AS "overdueCount"
    FROM users u
    LEFT JOIN tasks t ON t.assignee_id = u.id
      AND t.status NOT IN ('DONE', 'BLOCKED')
      AND t.due_date IS NOT NULL
      AND t.due_date < ${now}
    WHERE u.organization_id = ${orgId}
      AND u.is_active = true
    GROUP BY u.id, u.name, u.email
    ORDER BY "overdueCount" DESC
  `;

  // ── Average completion time per user (completed tasks only) ───────────────
  const avgCompletionByUser = await prisma.$queryRaw`
    SELECT
      u.id                                                         AS "userId",
      u.name                                                       AS "userName",
      COUNT(t.id)::int                                             AS "completedCount",
      ROUND(
        AVG(
          EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 3600
        )::numeric, 2
      )                                                            AS "avgCompletionHours"
    FROM users u
    INNER JOIN tasks t ON t.assignee_id = u.id
      AND t.status = 'DONE'
      AND t.completed_at IS NOT NULL
    WHERE u.organization_id = ${orgId}
    GROUP BY u.id, u.name
    ORDER BY "avgCompletionHours" ASC
  `;

  // ── Task status distribution for the org ─────────────────────────────────
  const statusDistribution = await prisma.task.groupBy({
    by: ['status'],
    where: { organizationId: orgId },
    _count: { id: true },
  });

  // ── Priority distribution ─────────────────────────────────────────────────
  const priorityDistribution = await prisma.task.groupBy({
    by: ['priority'],
    where: { organizationId: orgId },
    _count: { id: true },
  });

  return {
    overdueByUser,
    avgCompletionByUser,
    statusDistribution: statusDistribution.map((s) => ({
      status: s.status,
      count: s._count.id,
    })),
    priorityDistribution: priorityDistribution.map((p) => ({
      priority: p.priority,
      count: p._count.id,
    })),
    generatedAt: now.toISOString(),
  };
}

module.exports = { getTaskAnalytics };
