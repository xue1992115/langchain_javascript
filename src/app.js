/*
 * @Author: hxx
 * @Date: 2026-07-17 16:14:28
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 15:32:38
 */
import express from "express";
// 导入跨域中间件
import cors from "cors";
// 导入自定义请求日志中间件
import { requestLogger } from "./middleware/logger.middleware.js";
// 导入全局统一异常处理中间件
import { errorHandler } from "./middleware/error.middleware.js";
// 导入项目总路由聚合模块
import routes from "./routes/index.js";

const app = express();

// ---- 中间件 ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ---- 路由 ----
app.use("/api", routes);

// ---- 404 处理 ----
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: "接口不存在",
    },
  });
});

// ---- 全局错误处理 ----
app.use(errorHandler);

export default app;
