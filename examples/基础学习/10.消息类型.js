/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 13:32:56
 */
import "dotenv/config";
import { createAgent, tool, initChatModel } from 'langchain';
import * as z from 'zod';
import { HumanMessage, AIMessage, SystemMessage } from 'langchain';

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