/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 13:14:04
 */
import "dotenv/config";
import { createAgent, tool, initChatModel } from 'langchain';
import * as z from 'zod';
import { HumanMessage, AIMessage, SystemMessage } from 'langchain';
const Answer = z.object({ summary: z.string(), confidence: z.number() });
// 1、创建一个天气的工具, 中文
const Movie = z.object({
  title: z.string().describe("The title of the movie"),
  year: z.number().describe("The year the movie was released"),
  director: z.string().describe("The director of the movie"),
  rating: z.number().describe("The movie's rating out of 10"),
});
const jsonSchema = {
  "title": "Movie",
  "description": "A movie with details",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "description": "The title of the movie",
    },
    "year": {
      "type": "integer",
      "description": "The year the movie was released",
    },
    "director": {
      "type": "string",
      "description": "The director of the movie",
    },
    "rating": {
      "type": "number",
      "description": "The movie's rating out of 10",
    },
  },
  "required": ["title", "year", "director", "rating"],
}

const getWeather = tool(
  (input) => `在 ${input.city} 天气总是晴朗的！`,
  {
    name: "get_weather",
    description: "获取给定城市的天气",
    schema: z.object({
      city: z.string().describe("要获取天气的城市"),
    }),
  }
);
// 2、初始化模型
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
    modelProvider: "openai",
    apiKey: process.env.MINIMAX_API_KEY,
    configuration: {
        baseURL: process.env.MINIMAX_API_BASE_URL
    }
});
// const modelWithStructure = chatMiniMax.withStructuredOutput(Movie, { includeRaw: true });
const modelWithStructure2 = chatMiniMax.withStructuredOutput(jsonSchema, { method: "jsonSchema" });
const response = await modelWithStructure2.invoke("电影阿甘正传的详细信息，包括标题、年份、导演和评分。");
console.log('Structured Response:', response);
console.log(chatMiniMax.profile);