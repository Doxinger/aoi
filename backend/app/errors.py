class AppError(Exception):
    status = 502
    code = None

    def __init__(self, message):
        super().__init__(message)
        self.message = message


class BlockedError(AppError):
    status = 451


class PayloadTooLargeError(AppError):
    status = 413


class UpstreamError(AppError):
    status = 502


class ValidationError(AppError):
    status = 422


class ConflictError(AppError):
    status = 409


class AuthError(AppError):
    status = 401


class TokenExpiredError(AppError):
    status = 401
    code = "token_expired"


class RateLimitError(AppError):
    status = 429


class NotFoundError(AppError):
    status = 404
