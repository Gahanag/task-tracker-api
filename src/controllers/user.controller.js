'use strict';

const userService = require('../services/user.service');
const { sendSuccess } = require('../utils/response');

async function listUsers(req, res, next) {
  try {
    const users = await userService.listUsers(req.user);
    sendSuccess(res, users);
  } catch (err) { next(err); }
}

async function getUser(req, res, next) {
  try {
    const user = await userService.getUserById(req.params.id, req.user);
    sendSuccess(res, user);
  } catch (err) { next(err); }
}

async function updateUserRole(req, res, next) {
  try {
    const user = await userService.updateUserRole(req.params.id, req.body.role, req.user);
    sendSuccess(res, user, 'User role updated');
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user);
    sendSuccess(res, user, 'User updated');
  } catch (err) { next(err); }
}

async function deactivateUser(req, res, next) {
  try {
    const user = await userService.deactivateUser(req.params.id, req.user);
    sendSuccess(res, user, 'User deactivated');
  } catch (err) { next(err); }
}

module.exports = { listUsers, getUser, updateUserRole, updateUser, deactivateUser };
