import { z } from "zod";
import { BaseTool } from "../utils/base-tool.js";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
//@ts-ignore
import recorder from "node-record-lpcm16";
import * as pty from "node-pty";
import os from "os";

// 加载环境变量
dotenv.config();

// 常量定义
const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const RECORDINGS_DIR = path.join(process.cwd(), "recordings");
const COMMAND = "/record";

// // 环境变量检查
// if (!OPENROUTER_MODEL_ID) {
//   throw new Error("OPENROUTER_MODEL_ID 环境变量未设置");
// }
// if (!OPENROUTER_API_KEY) {
//   throw new Error("OPENROUTER_API_KEY 环境变量未设置");
// }

// 初始化 OpenRouter 客户端
// const openrouter = createOpenRouter({
//   apiKey: OPENROUTER_API_KEY,
// });

/**
 * 面试录音工具类
 * 用于记录面试对话并进行评估
 */
export class interviewRecordingTool extends BaseTool {
  name = "interview-recording";
  description =
    "When the interview begins, call the system recording, record the interview conversation, and form a copy and evaluation. Use this tool when mentions /record";

  // 参数定义
  schema = z.object({
    name: z.string().optional().describe("录音文件名，默认为当前面试者姓名"),
  });

  /**
   * 执行录音工具
   * @param params 命令参数
   * @returns 执行结果
   */
  async execute({ name }: z.infer<typeof this.schema>): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }> {
    try {
      // 确保录音目录存在
      if (!fs.existsSync(RECORDINGS_DIR)) {
        fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
      }

      // 生成录音文件名
      const fileName = name || `interview_${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const filePath = path.join(RECORDINGS_DIR, `${fileName}.wav`);

      // 获取系统 shell
      const shell = os.platform() === "win32" ? "powershell.exe" : "bash";

      // 启动终端
      const terminal = pty.spawn(shell, [], {
        name: "xterm-color",
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env as { [key: string]: string },
      });
      terminal.onData((data) => {
        process.stdout.write(data);
      });

      terminal.write("ls\r");
      terminal.resize(100, 40);
      terminal.write("ls\r");

      // 输出终端启动信息
      return {
        content: [
          {
            type: "text",
            text: `终端已启动，准备开始录制面试 ${shell}。\n文件将保存为: ${filePath}\n\n请在终端中输入命令进行操作，输入 'exit' 结束录制。`,
          },
        ],
      };
    } catch (error) {
      console.error("Error executing tool:", error);
      throw error;
    }
  }
}
