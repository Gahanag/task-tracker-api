'use strict';

/**
 * Sends a consistent success response.
 */
function sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
  const response = {
    status: statusCode,
    message,
  };
  if (data !== null) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
}

/**
 * Sends a paginated response.
 */
function sendPaginated(res, { data, total, page, limit }) {
  return res.status(200).json({
    status: 200,
    message: 'Success',
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}

module.exports = { sendSuccess, sendPaginated };
