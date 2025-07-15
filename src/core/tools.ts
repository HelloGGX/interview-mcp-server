import { FastMCP } from "fastmcp";
import path from "path";
import z from "zod";
import fs from "fs/promises";
import {
  DEVELOPER_EVALUATION_DIMENSIONS,
  DEVELOPER_QUESTION_DESIGN,
  DEVELOPER_QUESTION_TYPES,
  DEVELOPER_TASK,
  EVALUATE,
  GENERATE_QUESTION,
  UI_EVALUATION_DIMENSIONS,
  UI_QUESTION_DESIGN,
  UI_QUESTION_TYPES,
  UI_TASK,
} from "./prompts.js";
import { CoreMessage, generateText, LanguageModelV1 } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import dotenv from "dotenv";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import os from "os";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { getPdfText } from "../utils/index.js";

// 加载环境变量
dotenv.config();

// 跨平台打开浏览器的函数
function openBrowser(url: string) {
  const platform = os.platform();
  let command: string;

  switch (platform) {
    case "win32":
      command = `start ${url}`;
      break;
    case "darwin":
      command = `open ${url}`;
      break;
    case "linux":
      command = `xdg-open ${url}`;
      break;
    default:
      console.error(`不支持的操作系统: ${platform}`);
      return;
  }

  exec(command, (error) => {
    if (error) {
      console.error(`打开浏览器失败: ${error.message}`);
    }
  });
}

export function registerTools(server: FastMCP) {
  server.addTool({
    name: "resume-to-question",
    description:
      "Generate interview questions based on a PDF resume file. Use this tool when mentions /q",
    parameters: z.object({
      absolutePathToPdfFile: z
        .string()
        .describe(
          "Absolute path to the PDF resume file that will be analyzed to generate relevant interview questions"
        ),
      position: z
        .enum(["frontend", "backend", "test", "ui", "ux"])
        .describe(
          "The target position type for the interview: frontend developer, backend developer, or test engineer"
        ),
      level: z
        .enum(["junior", "mid", "senior"])
        .describe(
          "The target experience level for the interview questions: junior (entry-level), mid (intermediate), or senior (advanced/leadership)"
        ),
    }),
    execute: async (params) => {
      let model: LanguageModelV1;
      // 常量定义
      const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID;
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

      if (OPENROUTER_MODEL_ID && OPENROUTER_API_KEY) {
        const openrouter = createOpenRouter({
          apiKey: OPENROUTER_API_KEY,
        });
        model = openrouter(OPENROUTER_MODEL_ID);
      } else if (DEEPSEEK_API_KEY) {
        const deepseek = createDeepSeek({
          apiKey: process.env.DEEPSEEK_API_KEY ?? "",
        });
        model = deepseek("deepseek-chat");
      } else {
        throw new Error("OPENROUTER_MODEL_ID or OPENROUTER_API_KEY or DEEPSEEK_API_KEY is not set");
      }

      try {
        // 获取pdf文件所在目录
        const pdfDir = path.dirname(params.absolutePathToPdfFile);
        // 生成markdown文件名，与pdf同名但后缀为.md
        const mdFileName = path.basename(params.absolutePathToPdfFile, ".pdf") + ".md";
        // 生成markdown文件的完整路径
        const mdFilePath = path.join(pdfDir, mdFileName);
        let markdownContent = "";

        // 检查简历的md文件是否已存在
        const fileExists = await fs
          .access(mdFilePath)
          .then(() => true)
          .catch(() => false);

        if (fileExists) {
          // 读取markdown文件内容
          markdownContent = await fs.readFile(mdFilePath, "utf-8");
        } else {
          // 文件不存在，继续转换流程
          markdownContent = await getPdfText(params.absolutePathToPdfFile);
        }
        // 将markdown内容写入文件
        await fs.writeFile(mdFilePath, markdownContent, "utf-8");

        const messages = `
        <resume>${markdownContent}</resume>
        <position>${params.position}</position>
        <level>${params.level}</level>
        `;

        let system = "";
        if (["ui", "ux"].includes(params.position)) {
          system = GENERATE_QUESTION(
            10,
            UI_TASK,
            UI_EVALUATION_DIMENSIONS,
            UI_QUESTION_TYPES,
            UI_QUESTION_DESIGN
          );
        } else {
          system = GENERATE_QUESTION(
            12,
            DEVELOPER_TASK,
            DEVELOPER_EVALUATION_DIMENSIONS,
            DEVELOPER_QUESTION_TYPES,
            DEVELOPER_QUESTION_DESIGN
          );
        }

        // 调用openrouter的api，生成面试问题
        const { text } = await generateText({
          system,
          messages: [
            {
              role: "user",
              content: messages,
            },
          ],
          model,
          maxTokens: 8192,
        });

        // 获取markdown文件所在目录
        const mdDir = path.dirname(params.absolutePathToPdfFile);
        // 生成markdown文件名，与pdf同名但后缀为.md
        const questionFilePath = path.join(mdDir, "question.md");
        // 将markdown内容写入文件
        await fs.writeFile(questionFilePath, text, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: `面试问题生成成功！文件已保存到: ${questionFilePath}`,
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text: "PDF转换失败，请检查文件路径和格式",
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: "evaluate-interview",
    description:
      "Evaluate the interviewer's performance based on the interview conversation, Use this tool when mentions /e",
    parameters: z.object({
      position: z
        .enum(["frontend", "backend", "test", "ui", "ux"])
        .describe(
          "The target position type for the interview: frontend developer, backend developer, or test engineer"
        ),
      absolutePathToQuestion: z
        .string()
        .describe("Absolute path to the question file in markdown format"),
      absolutePathToConversation: z
        .string()
        .describe("Absolute path to the conversation file in markdown format"),
    }),
    execute: async (params) => {
      let model: LanguageModelV1;
      // 常量定义
      const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID;
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

      if (OPENROUTER_MODEL_ID && OPENROUTER_API_KEY) {
        const openrouter = createOpenRouter({
          apiKey: OPENROUTER_API_KEY,
        });
        model = openrouter(OPENROUTER_MODEL_ID);
      } else if (DEEPSEEK_API_KEY) {
        const deepseek = createDeepSeek({
          apiKey: process.env.DEEPSEEK_API_KEY ?? "",
        });
        model = deepseek("deepseek-chat");
      } else {
        throw new Error("OPENROUTER_MODEL_ID or OPENROUTER_API_KEY or DEEPSEEK_API_KEY is not set");
      }
      try {
        // 读取markdown文件内容
        const questionContent = await fs.readFile(params.absolutePathToQuestion, "utf-8");
        const conversationContent = await fs.readFile(params.absolutePathToConversation, "utf-8");

        const interviewMessages = `
        <position>${params.position}</position>
        <question>${questionContent}</question>
        <conversation>${conversationContent}</conversation>
        `;
        const messages: Array<CoreMessage> = [
          {
            role: "user",
            content: interviewMessages,
          },
        ];

        let system = "";
        if (["ui", "ux"].includes(params.position)) {
          system = EVALUATE(UI_EVALUATION_DIMENSIONS, 10);
        } else {
          system = EVALUATE(DEVELOPER_EVALUATION_DIMENSIONS, 12);
        }

        // 调用openrouter的api，生成评估报告
        const { text } = await generateText({
          system: system,
          messages,
          model,
          maxTokens: 8192,
        });

        messages.push({
          role: "assistant",
          content: `
          <evaluation>${text}</evaluation>
          `,
        });

        messages.push({
          role: "user",
          content: BRAIN_STORMING,
        });

        // 获取评估报告文件路径
        const conversationDir = path.dirname(params.absolutePathToConversation);
        const evaluationFileName = "evaluation.md";
        const evaluationFilePath = path.join(conversationDir, evaluationFileName);
        const date = new Date();
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; // Format as YYYY-MM-DD HH:mm

        const formattedText = `面试日期: ${formattedDate}\n${text}`;
        // 将评估报告写入文件
        await fs.writeFile(evaluationFilePath, formattedText, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: `评估报告生成成功！文件已保存到: ${evaluationFilePath}`,
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text: "评估报告生成失败，请检查文件路径和格式",
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: "record-interview",
    description:
      "When the user mentions to start an interview, use this tool to record the interview conversation. Use this tool when mentioning /record",
    parameters: z.object({
      absolutePathToPdfFile: z.string().describe("Absolute path to the resume/CV file"),
    }),
    execute: async (params) => {
      try {
        // let smartVoiceSocket = null;

        const wss = new WebSocketServer({ port: 3000 });
        // 创建Express应用
        const app = express();
        const httpServer = http.createServer(app);

        // 解析JSON请求体
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // 获取当前文件的目录
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        // 静态文件服务 - 提供recorder目录下的文件
        const recorderPath = path.resolve(__dirname, "./recorder");
        app.use(express.static(recorderPath));

        wss.on("connection", (ws) => {
          console.error(`智能语音页面websocket连接成功: ${ws.url}`);
          // smartVoiceSocket = ws;
          // Set up ping/pong for keepalive
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.ping();
            }
          }, 30000);

          ws.on("message", (data) => {
            try {
              const message = JSON.parse(data.toString());

              if (message.type === "ping") {
                // Respond to ping with pong
                ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
              } else if (message.type === "save-recording") {
                // Handle tool response
                const { transcript, timestamp } = message;
                const date = new Date(timestamp || Date.now());

                let transcriptPath: string | null = null;

                // 保存转录文本
                if (transcript) {
                  const transcriptFileName = `conversation.md`;
                  // 获取PDF文件所在目录，保存转录文件到同级目录
                  const pdfDir = path.dirname(params.absolutePathToPdfFile);
                  transcriptPath = path.join(pdfDir, transcriptFileName);

                  const content = `# 面试对话记录\n## 面试时间\n${date.toLocaleString("zh-CN")}\n## 对话内容\n${transcript}`;

                  fs.writeFile(transcriptPath, content, "utf-8");
                  console.error(`转录文件已保存: ${transcriptPath}`);
                }
              }
            } catch (error) {
              console.error("Error processing message:", error);
            }
          });
          ws.on("close", () => {
            console.error("智能语音页面断开连接");
            // smartVoiceSocket = null;
            clearInterval(pingInterval);
          });
          ws.on("error", (error) => {
            console.error("WebSocket error:", error);
          });
        });

        // 启动服务器
        const port = 3002;
        httpServer.listen(port, () => {
          console.error(`录音服务器已启动: http://localhost:${port}`);
          // 打开浏览器
          const url = `http://localhost:${port}`;
          openBrowser(url);
        });

        return {
          content: [
            {
              type: "text",
              text: `录音服务器已启动在 http://localhost:${port}，浏览器窗口已打开。请在网页中进行录音操作，录音结束后转录内容将自动保存为markdown文件。`,
            },
          ],
        };
      } catch (error) {
        console.error("启动录音服务器失败:", error);
        return {
          content: [
            {
              type: "text",
              text: "启动录音服务器失败，请检查端口是否被占用或权限是否足够",
            },
          ],
        };
      }
    },
  });
}
