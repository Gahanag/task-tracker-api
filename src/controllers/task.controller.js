'use strict';

const taskService = require('../services/task.service');
const { sendSuccess, sendPaginated } = require('../utils/response');

async function createTask(req, res, next) {
  try {
    const task = await taskService.createTask(req.body, req.user);
    sendSuccess(res, task, 'Task created', 201);
  } catch (err) {
    next(err);
  }
}

async function getTask(req, res, next) {
  try {
    const task = await taskService.getTaskById(req.params.id, req.user);
    sendSuccess(res, task);
  } catch (err) {
    next(err);
  }
}

async function listTasks(req, res, next) {
  try {
    const result = await taskService.listTasks(req.query, req.user);
    sendPaginated(res, result);
  } catch (err) {
    next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const task = await taskService.updateTask(req.params.id, req.body, req.user);
    sendSuccess(res, task, 'Task updated');
  } catch (err) {
    next(err);
  }
}

async function updateTaskStatus(req, res, next) {
  try {
    const task = await taskService.updateTaskStatus(req.params.id, req.body, req.user);
    sendSuccess(res, task, 'Task status updated');
  } catch (err) {
    next(err);
  }
}

async function deleteTask(req, res, next) {
  try {
    await taskService.deleteTask(req.params.id, req.user);
    sendSuccess(res, null, 'Task deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = { createTask, getTask, listTasks, updateTask, updateTaskStatus, deleteTask };
