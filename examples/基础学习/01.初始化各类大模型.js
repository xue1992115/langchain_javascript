import "dotenv/config";
import { createAgent, tool, initChatModel } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatOpenRouter } from "@langchain/openrouter";
import * as z from "zod";
// 1 对接国内的大模型
// 1.1 deepseek大模型
// 1.1.1 通过ChatDeepSeek类来对接deepseek大模型
// const deepseek01 = new ChatDeepSeek({
//   apiKey: process.env.DEEPSEEK_API_KEY,
//   model: "deepseek-v4-flash",
// });
// const response01 = await deepseek01.invoke("介绍一下你自己");
// console.log("response01", response01.content);

// 1.1.2 ChatOpenAI类对接国内大模型(国内的大模型都兼容了OpenAI的API)
// const deepseek02 = new ChatOpenAI({
//   apiKey: process.env.DEEPSEEK_API_KEY,
//   model: "deepseek-v4-flash",
//   configuration: {
//     //  需要配置baseURL，默认是https://api.openai.com/v1，如果不配置就会转发到默认的openai的api上去，国内大模型都兼容了OpenAI的API，但是需要配置baseURL
//     baseURL: process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com",
//   }
// });
// const response02 = await deepseek02.invoke("介绍一下你自己");
// console.log("response02", response02.content);

// 1.1.3 openrouter对接国内大模型（需要充值）
// const deepseek04 = new ChatOpenRouter({
//     model: "deepseek/deepseek-v4-flash",
//     apiKey: process.env.OPENROUTER_API_KEY,
//     baseURL: process.env.OPENROUTER_API_BASE_URL
// })
// const response04 = await deepseek04.invoke("介绍一下你自己");
// console.log("response04", response04.content);


// 1.1.4 通过initChatModel函数来对接国内大模型
// const deepseek03 = await initChatModel("deepseek-v4-flash", {
//     modelProvider: "deepseek",
//     apiKey: process.env.DEEPSEEK_API_KEY,
//     baseURL: process.env.DEEPSEEK_API_BASE_URL
// });
// const response03 = await deepseek03.invoke("介绍一下你自己");
// console.log("response03", response03.content);


// 1.2 对接国内的其他大模型（公司内部部署的大模型 星博士）
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
    modelProvider: "openai",
    apiKey: process.env.MINIMAX_API_KEY,
    configuration: {
        baseURL: process.env.MINIMAX_API_BASE_URL
    }
});
const response05 = await chatMiniMax.invoke("介绍一下你自己");
console.log("response05", response05.content);
