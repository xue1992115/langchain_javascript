/**
 * 远程天气 MCP 服务器
 * 通过 SSE (Server-Sent Events) 传输协议提供天气查询工具
 *
 * 启动方式: node weather_server.js
 * 运行在 http://localhost:8000/mcp
 * 由 17.MCP.js 自动通过 MultiServerMCPClient 加载
 */
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// 创建 MCP 服务器实例
const server = new McpServer({
  name: "WeatherServer",
  version: "1.0.0",
});

// ========== 模拟天气数据 ==========
const weatherData = {
  "北京": { temperature: 28, condition: "晴朗", humidity: 45, wind: "3级" },
  "上海": { temperature: 32, condition: "多云", humidity: 70, wind: "4级" },
  "广州": { temperature: 35, condition: "阵雨", humidity: 85, wind: "2级" },
  "深圳": { temperature: 33, condition: "多云转阴", humidity: 80, wind: "3级" },
  "杭州": { temperature: 30, condition: "阴天", humidity: 75, wind: "3级" },
  "成都": { temperature: 27, condition: "小雨", humidity: 78, wind: "2级" },
  "武汉": { temperature: 34, condition: "晴转多云", humidity: 60, wind: "4级" },
  "西安": { temperature: 31, condition: "晴朗", humidity: 40, wind: "3级" },
  "拉萨": { temperature: 18, condition: "晴朗", humidity: 25, wind: "5级" },
  "哈尔滨": { temperature: 22, condition: "多云", humidity: 55, wind: "3级" },
};

const weatherConditions = ["晴朗", "多云", "阴天", "小雨", "阵雨", "晴转多云", "多云转阴"];

function getRandomCondition() {
  return weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
}

function getRandomTemp(baseTemp) {
  return baseTemp + Math.floor(Math.random() * 10) - 3;
}

// ========== 注册天气工具 ==========

// 1. 获取当前天气
server.tool(
  "get_weather",
  "获取指定城市的当前天气情况",
  { city: z.string().describe("城市名称") },
  async ({ city }) => {
    const weather = weatherData[city];
    if (!weather) {
      return {
        content: [{ type: "text", text: `抱歉，没有「${city}」的天气数据。支持的城市：${Object.keys(weatherData).join("、")}` }],
      };
    }
    return {
      content: [{
        type: "text",
        text: `${city}当前天气：\n温度：${weather.temperature}°C\n天气状况：${weather.condition}\n湿度：${weather.humidity}%\n风力：${weather.wind}`,
      }],
    };
  }
);

// 2. 获取天气预报（未来几天）
server.tool(
  "get_forecast",
  "获取指定城市未来几天的天气预报",
  {
    city: z.string().describe("城市名称"),
    days: z.number().min(1).max(7).describe("预报天数 (1-7)"),
  },
  async ({ city, days }) => {
    const baseWeather = weatherData[city];
    if (!baseWeather) {
      return {
        content: [{ type: "text", text: `抱歉，没有「${city}」的天气数据。` }],
      };
    }

    const forecast = [];
    for (let i = 1; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`;
      forecast.push({
        date: dateStr,
        temperature: getRandomTemp(baseWeather.temperature),
        condition: getRandomCondition(),
      });
    }

    const forecastText = forecast.map(
      (f) => `${f.date}：${f.temperature}°C，${f.condition}`
    ).join("\n");

    return {
      content: [{
        type: "text",
        text: `${city}未来 ${days} 天天气预报：\n${forecastText}`,
      }],
    };
  }
);

// 3. 获取支持的城市列表
server.tool(
  "list_cities",
  "获取所有支持天气查询的城市列表",
  {},
  async () => {
    const cities = Object.entries(weatherData).map(
      ([name, data]) => `${name}（${data.temperature}°C，${data.condition}）`
    ).join("\n");
    return {
      content: [{ type: "text", text: `支持的城市：\n${cities}` }],
    };
  }
);

// ========== 启动 HTTP 服务器 (SSE 传输) ==========
const app = express();
app.use(express.json());

// 存储会话传输实例，key 为 sessionId
const transports = {};

// GET /mcp — 建立 SSE 连接
app.get("/mcp", async (req, res) => {
  const transport = new SSEServerTransport("/mcp", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  try {
    await server.connect(transport);
  } catch (error) {
    console.error("连接 SSE 传输时出错:", error);
    delete transports[transport.sessionId];
  }
});

// POST /mcp?sessionId=xxx — 处理客户端消息
app.post("/mcp", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];

  if (transport) {
    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error("处理消息时出错:", error);
      if (!res.headersSent) {
        res.status(500).end("内部错误");
      }
    }
  } else {
    res.status(404).end("未找到会话，请重新建立 SSE 连接");
  }
});

// 启动服务器
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`🌤️  天气 MCP 服务器已启动`)
  console.log(`    SSE 端点: http://localhost:${PORT}/mcp`);
  console.log(`    支持工具: get_weather, get_forecast, list_cities`);
});
