import morgan from "morgan";

/**
 * 请求日志中间件
 * 开发环境输出详细日志，生产环境输出精简日志
 */
export const requestLogger = morgan(
  process.env.NODE_ENV === "production" ? "combined" : "dev"
);
