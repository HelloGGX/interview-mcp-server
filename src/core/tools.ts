import { FastMCP } from "fastmcp";
import path from "path";
import z from "zod";
import fs from "fs/promises";
import pdf2md from "@opendocsg/pdf2md";
import { EVALUATE, GENERATE_QUESTION } from "./prompts.js";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import dotenv from "dotenv";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import express, { Request, Response } from "express";
import http from "http";

// 加载环境变量
dotenv.config();

// 常量定义
const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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
      try {
        if (!OPENROUTER_MODEL_ID) {
          throw new Error("OPENROUTER_MODEL_ID is not set");
        }
        if (!OPENROUTER_API_KEY) {
          throw new Error("OPENROUTER_API_KEY is not set");
        }

        const openrouter = createOpenRouter({
          apiKey: OPENROUTER_API_KEY,
        });

        // 获取pdf文件所在目录
        const pdfDir = path.dirname(params.absolutePathToPdfFile);
        // 生成markdown文件名，与pdf同名但后缀为.md
        const mdFileName = path.basename(params.absolutePathToPdfFile, ".pdf") + ".md";
        // 生成markdown文件的完整路径
        const mdFilePath = path.join(pdfDir, mdFileName);
        let markdownContent = "";

        // 检查md文件是否已存在
        const fileExists = await fs
          .access(mdFilePath)
          .then(() => true)
          .catch(() => false);

        if (fileExists) {
          // 读取markdown文件内容
          markdownContent = await fs.readFile(mdFilePath, "utf-8");
        } else {
          // 文件不存在，继续转换流程
          const dataBuffer = await fs.readFile(params.absolutePathToPdfFile);
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          markdownContent = await pdf2md(dataBuffer);
        }
        // 将markdown内容写入文件
        await fs.writeFile(mdFilePath, markdownContent, "utf-8");

        const messages = `
        <resume>${markdownContent}</resume>
        <position>${params.position}</position>
        <level>${params.level}</level>
        `;

        // 调用openrouter的api，生成面试问题
        const { text } = await generateText({
          system: GENERATE_QUESTION,
          messages: [
            {
              role: "user",
              content: messages,
            },
          ],
          model: openrouter(OPENROUTER_MODEL_ID),
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
              text: `转换成功！文件已保存到${questionFilePath}`,
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
      absolutePathToQuestion: z
        .string()
        .describe("Absolute path to the question file in markdown format"),
      absolutePathToConversation: z
        .string()
        .describe("Absolute path to the conversation file in markdown format"),
    }),
    execute: async (params) => {
      try {
        if (!OPENROUTER_MODEL_ID) {
          throw new Error("OPENROUTER_MODEL_ID is not set");
        }
        if (!OPENROUTER_API_KEY) {
          throw new Error("OPENROUTER_API_KEY is not set");
        }

        const openrouter = createOpenRouter({
          apiKey: OPENROUTER_API_KEY,
        });

        // 读取markdown文件内容
        const questionContent = await fs.readFile(params.absolutePathToQuestion, "utf-8");
        const conversationContent = await fs.readFile(params.absolutePathToConversation, "utf-8");

        const messages = `
        <question>${questionContent}</question>
        <conversation>${conversationContent}</conversation>
        `;

        // 调用openrouter的api，生成评估报告
        const { text } = await generateText({
          system: EVALUATE,
          messages: [
            {
              role: "user",
              content: messages,
            },
          ],
          model: openrouter(OPENROUTER_MODEL_ID),
          maxTokens: 8192,
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
    parameters: z.object({}),
    execute: async () => {
      try {
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

        // API端点 - 接收录音数据
        app.post("/api/save-recording", async (req: Request, res: Response) => {
          try {
            const { transcript, timestamp } = req.body;

            // 生成文件名
            const date = new Date(timestamp || Date.now());
            const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}`;

            // 保存转录文本
            if (transcript) {
              const transcriptFileName = `interview_conversation_${formattedDate}.md`;
              const transcriptPath = path.join(process.cwd(), transcriptFileName);

              const content = `# 面试对话记录
              
              ## 面试时间
              ${date.toLocaleString("zh-CN")}

              ## 对话内容
              ${transcript}
              `;

              await fs.writeFile(transcriptPath, content, "utf-8");
              console.error(`转录文件已保存: ${transcriptPath}`);
            }

            res.json({
              success: true,
              message: "录音数据已保存",
              transcriptPath: transcript ? `interview_conversation_${formattedDate}.md` : null,
            });
          } catch (error) {
            console.error("保存录音数据失败:", error);
            res.status(500).json({ success: false, message: "保存失败" });
          }
        });

        // 启动服务器
        const port = 3002;
        httpServer.listen(port, () => {
          console.error(`录音服务器已启动: http://localhost:${port}`);

          // 打开浏览器
          const url = `http://localhost:${port}`;
          exec(`start ${url}`);
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
