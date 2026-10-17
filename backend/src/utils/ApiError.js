class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'No autorizado.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'No tienes permiso para esta acción.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'No encontrado.') {
    return new ApiError(404, message);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }

  static unprocessable(message, details) {
    return new ApiError(422, message, details);
  }
}

module.exports = { ApiError };
