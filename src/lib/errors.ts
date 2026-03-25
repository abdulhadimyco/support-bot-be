export class AppError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number = 500,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = this.constructor.name;
	}
}

export class BadRequestError extends AppError {
	constructor(message = "Bad Request", cause?: unknown) {
		super(message, 400, cause);
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = "Unauthorized", cause?: unknown) {
		super(message, 401, cause);
	}
}

export class ForbiddenError extends AppError {
	constructor(message = "Forbidden", cause?: unknown) {
		super(message, 403, cause);
	}
}

export class NotFoundError extends AppError {
	constructor(message = "Not Found", cause?: unknown) {
		super(message, 404, cause);
	}
}

export class ConflictError extends AppError {
	constructor(message = "Conflict", cause?: unknown) {
		super(message, 409, cause);
	}
}
