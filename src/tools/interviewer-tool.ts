import { z } from "zod";
import { BaseTool } from "../utils/base-tool.js";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import dotenv from "dotenv";
import { exec } from "child_process";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import pdf2md from "@opendocsg/pdf2md";
import { generateText } from "ai";
import { transformMessages } from "../utils/interview.js";
import { EVALUATE, GENERATE_QUESTION } from "../prompts/interview.js";

// 加载环境变量
dotenv.config();

// 常量定义
const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * 面试录音工具类
 * 用于记录面试对话并进行评估
 */
export class recordTool extends BaseTool {
  name = "recordTool";
  description =
    "When the user mentions to start an interview, use this tool to record the interview conversation. Use this tool when mentioning /record";

  // 参数定义
  schema = z.object({});
  /**
   * 执行录音工具
   * @param params 命令参数
   * @returns 执行结果
   */
  async execute({}: z.infer<typeof this.schema>): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> {
    try {
      // 获取recorder.html文件的相对路径
      const htmlPath = path.resolve(__dirname, "../recorder.html");
      // 打开浏览器
      let openCommand;
      if (process.platform === "darwin") {
        openCommand = `open ${htmlPath}`;
      } else if (process.platform === "win32") {
        openCommand = `start ${htmlPath}`;
      } else {
        openCommand = `xdg-open ${htmlPath}`;
      }

      exec(openCommand, (error) => {
        if (error) {
          console.error("打开浏览器失败:", error);
        }
      });

      return {
        content: [
          {
            type: "text",
            text: `已启动录音界面，浏览器窗口已打开，录音已自动开始。完成后点击"结束录音"按钮保存录音文件。`,
          },
        ],
      };
    } catch (error) {
      console.error("执行工具时出错:", error);
      throw error;
    }
  }
}

export class pdfToMdTool extends BaseTool {
  name = "pdfToMdTool";
  description = "Convert the content in pdf to markdown file";

  // 参数定义
  schema = z.object({
    absolutePathToPdfFile: z
      .string()
      .describe("Absolute path to the pdf file that needs to be converted to markdown"),
  });
  /**
   * 执行录音工具
   * @param params 命令参数
   * @returns 执行结果
   */
  async execute({ absolutePathToPdfFile }: z.infer<typeof this.schema>): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> {
    try {
      // 获取pdf文件所在目录
      const pdfDir = path.dirname(absolutePathToPdfFile);
      // 生成markdown文件名，与pdf同名但后缀为.md
      const mdFileName = path.basename(absolutePathToPdfFile, ".pdf") + ".md";
      // 生成markdown文件的完整路径
      const mdFilePath = path.join(pdfDir, mdFileName);

      // 检查md文件是否已存在
      const fileExists = await fs
        .access(mdFilePath)
        .then(() => true)
        .catch(() => false);

      if (fileExists) {
        // 如果文件存在，直接返回
        return {
          content: [
            {
              type: "text",
              text: `Markdown文件已存在：${mdFilePath}`,
            },
          ],
        };
      }
      // 文件不存在，继续转换流程
      const dataBuffer = await fs.readFile(absolutePathToPdfFile);
      // @ts-ignore
      const text = await pdf2md(dataBuffer);
      // 将markdown内容写入文件
      await fs.writeFile(mdFilePath, text, "utf-8");
      return {
        content: [
          {
            type: "text",
            text: `转换成功！文件已保存到${mdFilePath}`,
          },
        ],
      };
    } catch (error) {
      console.error("PDF转换失败:", error);
      return {
        content: [
          {
            type: "text",
            text: "PDF转换失败，请检查文件路径和格式",
          },
        ],
      };
    }
  }
}

export class mdToQuestionTool extends BaseTool {
  name = "mdToQuestionTool";
  description =
    "Generate interview questions and answers based on the content in the markdown file";

  // 参数定义
  schema = z.object({
    absolutePathToMdFile: z
      .string()
      .describe("The absolute address of the resume file in markdown format"),
    // 前端开发、后端开发、测试工程师
    position: z
      .enum(["frontend", "backend", "test"])
      .describe("The type of interview, frontend or backend or test"),
    level: z
      .enum(["junior", "mid", "senior"])
      .describe(
        "The ability level of the interviewee is divided into: beginner, intermediate and advanced"
      ),
  });

  async execute({ absolutePathToMdFile, level, position }: z.infer<typeof this.schema>): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> {
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
      const mdContent = await fs.readFile(absolutePathToMdFile, "utf-8");
      const messages = transformMessages([
        {
          role: "user",
          content: {
            type: "text",
            text: `<resume>${mdContent}</resume>
            <position>${position}</position>
            <level>${level}</level>`,
          },
        },
      ]);

      // 调用openrouter的api，生成面试问题
      const { text } = await generateText({
        system: GENERATE_QUESTION,
        messages: messages,
        model: openrouter(OPENROUTER_MODEL_ID),
        maxTokens: 8192,
      });

      // 获取markdown文件所在目录
      const mdDir = path.dirname(absolutePathToMdFile);
      // 生成markdown文件名，与pdf同名但后缀为.md
      const mdFileName = "question.md";
      // 生成markdown文件的完整路径
      const mdFilePath = path.join(mdDir, mdFileName);
      // 将markdown内容写入文件
      await fs.writeFile(mdFilePath, text, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `面试问题生成成功，文件已保存到${mdFilePath}`,
          },
        ],
      };
    } catch (error) {
      console.error("面试问题生成失败:", error);
      return {
        content: [
          {
            type: "text",
            text: "面试问题生成失败",
          },
        ],
      };
    }
  }
}

export class questionTool extends BaseTool {
  name = "questionTool";
  description =
    "Generate interview questions and answers based on the content of the pdf resume file, Use this tool when mentions /question";

  // 参数定义
  schema = z.object({});

  async execute({}: z.infer<typeof this.schema>): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> {
    return {
      content: [
        {
          type: "text",
          text: `Use the following MCP tools one after the other in this exact sequence:
      step 1. pdfToMdTool
      step 2. mdToQuestionTool
      After running all of these tools, Please end the model call`,
        },
      ],
    };
  }
}

export class evaluateTool extends BaseTool {
  name = "evaluateTool";
  description =
    "Evaluate the interviewer's performance based on the interview conversation, Use this tool when mentions /evaluate";

  // 参数定义
  schema = z.object({
    absolutePathToQuestion: z
      .string()
      .describe("Absolute path to the question file in markdown format"),
    absolutePathToConversation: z
      .string()
      .describe("Absolute path to the conversation file in markdown format"),
  });

  async execute({
    absolutePathToConversation,
    absolutePathToQuestion,
  }: z.infer<typeof this.schema>): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> {
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
      const questionContent = await fs.readFile(absolutePathToQuestion, "utf-8");
      const conversationContent = await fs.readFile(absolutePathToConversation, "utf-8");

      // 基于conversationContent内容，简历内容，问题内容，生成评估报告，其中占比重要性为对话内容的60%，简历内容的10%，问题内容的30%
      const messages = transformMessages([
        {
          role: "user",
          content: {
            type: "text",
            text: `<question>${questionContent}</question>
            <conversation>${conversationContent}</conversation>`,
          },
        },
      ]);

      // 调用openrouter的api，生成评估报告
      const { text } = await generateText({
        system: EVALUATE,
        messages: messages,
        model: openrouter(OPENROUTER_MODEL_ID),
        maxTokens: 8192,
      });

      // 获取评估报告文件路径
      const conversationDir = path.dirname(absolutePathToConversation);
      const evaluationFileName = "evaluation.md";
      const evaluationFilePath = path.join(conversationDir, evaluationFileName);
      const date = new Date();
      const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; // Format as YYYY-MM-DD HH:mm

      const formattedText = `面试日期: ${formattedDate} 
      ${text}`;
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
    } catch (error) {
      console.error("评估报告生成失败:", error);
      return {
        content: [
          {
            type: "text",
            text: `评估报告生成失败${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
}
