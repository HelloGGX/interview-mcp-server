import { z } from "zod";
import { BaseTool } from "../utils/base-tool.js";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import dotenv from "dotenv";
import { exec } from "child_process";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

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
export class interviewRecordingTool extends BaseTool {
  name = "interview-recording";
  description = "当面试开始时，记录面试对话，并形成副本和评估。当用户输入 /record 时使用此工具";

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
