import express from "express";
import cors from "cors";
import { requestLogger } from "./middleware/logger.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
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
