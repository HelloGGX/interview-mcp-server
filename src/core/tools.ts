import { FastMCP } from "fastmcp";
import path from "path";
import z from "zod";
import fs from "fs/promises";
import pdf2md from "@opendocsg/pdf2md";

export function registerTools(server: FastMCP) {
  server.addTool({
    name: "resume-to-question",
    description: "Generate interview questions based on a PDF resume file.",
    parameters: z.object({
      absolutePathToPdfFile: z
        .string()
        .describe(
          "Absolute path to the PDF resume file that will be analyzed to generate relevant interview questions"
        ),
      position: z
        .enum(["frontend", "backend", "test"])
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
        }
        // 文件不存在，继续转换流程
        const dataBuffer = await fs.readFile(params.absolutePathToPdfFile);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        markdownContent = await pdf2md(dataBuffer);
        // 将markdown内容写入文件
        await fs.writeFile(mdFilePath, markdownContent, "utf-8");

        

        return {
          content: [
            {
              type: "text",
              text: `转换成功！文件已保存到${mdFilePath}`,
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
}
