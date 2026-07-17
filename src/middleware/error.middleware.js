/**
 * 全局错误处理中间件
 */
export function errorHandler(err, _req, res, _next) {
  console.error(`[Error] ${err.message}`);
  console.error(err.stack);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || "服务器内部错误",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
}

/**
 * 创建可携带状态码的错误
 */
export function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
