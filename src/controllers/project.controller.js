'use strict';

const projectService = require('../services/project.service');
const analyticsService = require('../services/analytics.service');
const { sendSuccess } = require('../utils/response');

// ─── Project Controller ───────────────────────────────────────────────────────
const projectController = {
  async create(req, res, next) {
    try {
      const project = await projectService.createProject(req.body, req.user);
      sendSuccess(res, project, 'Project created', 201);
    } catch (err) { next(err); }
  },

  async list(req, res, next) {
    try {
      const projects = await projectService.listProjects(req.user);
      sendSuccess(res, projects);
    } catch (err) { next(err); }
  },

  async get(req, res, next) {
    try {
      const project = await projectService.getProjectById(req.params.id, req.user);
      sendSuccess(res, project);
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const project = await projectService.updateProject(req.params.id, req.body, req.user);
      sendSuccess(res, project, 'Project updated');
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      await projectService.deleteProject(req.params.id, req.user);
      sendSuccess(res, null, 'Project deleted');
    } catch (err) { next(err); }
  },
};

// ─── Analytics Controller ─────────────────────────────────────────────────────
const analyticsController = {
  async getAnalytics(req, res, next) {
    try {
      const data = await analyticsService.getTaskAnalytics(req.user);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  },
};

module.exports = { projectController, analyticsController };
