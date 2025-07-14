import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * PDF文本项接口定义
 * 包含从PDF.js提取的文本项的基本信息
 */
interface PDFTextItem {
  str?: string; // 文本内容
  transform?: number[]; // 变换矩阵，包含位置和大小信息
  width?: number; // 文本宽度
  height?: number; // 文本高度
  fontName?: string; // 字体名称
}

/**
 * 文本行接口定义
 * 表示经过处理后的一行文本及其样式信息
 */
interface TextLine {
  text: string; // 行文本内容
  fontSize: number; // 字体大小
  y: number; // Y坐标位置
  x: number; // X坐标位置
  isBold: boolean; // 是否为粗体
  isItalic: boolean; // 是否为斜体
}

/**
 * 内容块接口定义
 * 表示文档中的一个结构化内容块（如标题、段落、列表等）
 */
interface ContentBlock {
  type: "heading" | "paragraph" | "list" | "code" | "table" | "quote"; // 内容类型
  level?: number; // 标题级别（仅用于heading类型）
  content: string; // 内容文本
  lines: TextLine[]; // 包含的文本行
}

/**
 * 主函数：将PDF文本项转换为Markdown格式
 * @param items PDF文本项数组
 * @returns 转换后的Markdown字符串
 */
function convertToMarkdown(items: PDFTextItem[]): string {
  if (!items || items.length === 0) return "";

  // 第一步：解析所有文本项并分组到行
  const lines = groupItemsIntoLines(items);

  // 第二步：分析文档结构，识别不同类型的内容块
  const structuredContent = analyzeDocumentStructure(lines);

  // 第三步：转换为Markdown格式
  return generateMarkdown(structuredContent);
}

/**
 * 将PDF文本项分组为文本行
 * 基于Y坐标位置判断哪些文本项属于同一行
 * @param items PDF文本项数组
 * @returns 分组后的文本行数组
 */
function groupItemsIntoLines(items: PDFTextItem[]): TextLine[] {
  const lines: TextLine[] = [];
  let currentLine: TextLine | null = null;

  for (const item of items) {
    // 跳过无效的文本项
    if (!item.str || typeof item.str !== "string" || !item.transform) {
      continue;
    }

    const text = item.str.trim();
    if (!text) continue;

    // 从变换矩阵中提取字体大小和位置信息
    const fontSize = Math.abs(item.transform[3]); // 字体大小
    const y = item.transform[5]; // Y坐标
    const x = item.transform[4]; // X坐标

    // 检测字体样式
    const fontName = item.fontName || "";
    const isBold =
      fontName.toLowerCase().includes("bold") ||
      fontName.toLowerCase().includes("heavy") ||
      fontSize > 14; // 大字体通常表示标题，也认为是粗体
    const isItalic =
      fontName.toLowerCase().includes("italic") || fontName.toLowerCase().includes("oblique");

    // 判断是否是新行：如果Y坐标差异超过字体大小的60%，则认为是新行
    if (!currentLine || Math.abs(y - currentLine.y) > fontSize * 0.6) {
      // 保存当前行
      if (currentLine && currentLine.text.trim()) {
        lines.push(currentLine);
      }

      // 创建新行
      currentLine = {
        text: text,
        fontSize,
        y,
        x,
        isBold,
        isItalic,
      };
    } else {
      // 同一行，合并文本
      // 如果需要添加空格来分隔单词
      if (currentLine.text && !currentLine.text.endsWith(" ") && !text.startsWith(" ")) {
        currentLine.text += " ";
      }
      currentLine.text += text;

      // 更新样式（如果当前项的字体更大，则使用当前项的样式）
      if (fontSize > currentLine.fontSize) {
        currentLine.fontSize = fontSize;
        currentLine.isBold = isBold;
        currentLine.isItalic = isItalic;
      }
    }
  }

  // 添加最后一行
  if (currentLine && currentLine.text.trim()) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * 分析文档结构，将文本行分类为不同类型的内容块
 * @param lines 文本行数组
 * @returns 结构化的内容块数组
 */
function analyzeDocumentStructure(lines: TextLine[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const text = line.text.trim();

    // 跳过空行
    if (!text) {
      i++;
      continue;
    }

    // 检测标题：基于字体大小、粗体样式和行长度
    if (isHeading(line, lines)) {
      const level = getHeadingLevel(line);
      blocks.push({
        type: "heading",
        level,
        content: text,
        lines: [line],
      });
    }
    // 检测列表项：以数字、字母或符号开头
    else if (isListItem(text)) {
      const listBlock = extractListBlock(lines, i);
      blocks.push(listBlock.block);
      i = listBlock.nextIndex - 1; // -1 因为循环会 +1
    }
    // 检测代码块：包含代码特征的文本
    else if (isCodeLine(text)) {
      const codeBlock = extractCodeBlock(lines, i);
      blocks.push(codeBlock.block);
      i = codeBlock.nextIndex - 1;
    }
    // 检测引用：以>或引号开头
    else if (isQuote(text)) {
      const quoteBlock = extractQuoteBlock(lines, i);
      blocks.push(quoteBlock.block);
      i = quoteBlock.nextIndex - 1;
    }
    // 检测表格：多列数据布局
    else if (isTableRow(line)) {
      const tableBlock = extractTableBlock(lines, i);
      blocks.push(tableBlock.block);
      i = tableBlock.nextIndex - 1;
    }
    // 普通段落：默认类型
    else {
      const paragraphBlock = extractParagraphBlock(lines, i);
      blocks.push(paragraphBlock.block);
      i = paragraphBlock.nextIndex - 1;
    }

    i++;
  }

  return blocks;
}

/**
 * 判断是否为标题行
 * @param line 当前文本行
 * @param allLines 所有文本行（用于计算平均字体大小）
 * @returns 是否为标题
 */
function isHeading(line: TextLine, allLines: TextLine[]): boolean {
  // 计算平均字体大小
  const avgFontSize = calculateAverageFontSize(allLines);

  // 字体大小明显大于平均值（20%以上）
  const isLargerFont = line.fontSize > avgFontSize * 1.2;

  // 或者明显加粗且字体不小于平均值
  const isBoldTitle = line.isBold && line.fontSize >= avgFontSize;

  // 标题通常比较短（少于100字符）
  const isShortLine = line.text.length < 100;

  return (isLargerFont || isBoldTitle) && isShortLine;
}

/**
 * 根据字体大小确定标题级别
 * @param line 文本行
 * @returns 标题级别（1-4）
 */
function getHeadingLevel(line: TextLine): number {
  if (line.fontSize > 20) return 1; // 一级标题
  if (line.fontSize > 16) return 2; // 二级标题
  if (line.fontSize > 14) return 3; // 三级标题
  return 4; // 四级标题
}

/**
 * 判断是否为列表项
 * @param text 文本内容
 * @returns 是否为列表项
 */
function isListItem(text: string): boolean {
  // 检测各种列表格式的正则表达式
  const listPatterns = [
    /^\d+\.\s+/, // 数字列表：1. 2. 3.
    /^[•·▪▫‣⁃]\s+/, // 各种项目符号
    /^[-*+]\s+/, // 破折号、星号、加号
    /^[a-zA-Z]\.\s+/, // 字母列表：a. b. c.
    /^[ivxlcdm]+\.\s+/i, // 罗马数字：i. ii. iii.
  ];

  return listPatterns.some((pattern) => pattern.test(text));
}

/**
 * 判断是否为代码行
 * @param text 文本内容
 * @returns 是否为代码行
 */
function isCodeLine(text: string): boolean {
  // 检测代码特征的正则表达式
  const codeIndicators = [
    /^```/, // 代码块标记
    /^\s{4,}/, // 4个或更多空格缩进
    /^\t/, // Tab缩进
    /[{}();]/, // 包含代码符号
    /^(function|class|import|export|const|let|var|if|for|while)\s/, // 编程关键字
  ];

  return codeIndicators.some((pattern) => pattern.test(text));
}

/**
 * 判断是否为引用文本
 * @param text 文本内容
 * @returns 是否为引用
 */
function isQuote(text: string): boolean {
  return /^>\s+/.test(text) || /^"|^'/.test(text);
}

/**
 * 判断是否为表格行
 * @param line 文本行
 * @returns 是否为表格行
 */
function isTableRow(line: TextLine): boolean {
  // 简单的表格检测：检查是否有多个用大量空格分隔的列
  const columns = line.text.split(/\s{3,}/); // 3个或更多空格作为分隔符
  return columns.length >= 2;
}

/**
 * 计算所有文本行的平均字体大小
 * @param lines 文本行数组
 * @returns 平均字体大小
 */
function calculateAverageFontSize(lines: TextLine[]): number {
  if (lines.length === 0) return 12; // 默认字体大小
  const sum = lines.reduce((acc, line) => acc + line.fontSize, 0);
  return sum / lines.length;
}

/**
 * 提取列表块
 * @param lines 所有文本行
 * @param startIndex 开始索引
 * @returns 列表块和下一个索引
 */
function extractListBlock(
  lines: TextLine[],
  startIndex: number
): { block: ContentBlock; nextIndex: number } {
  const listLines: TextLine[] = [];
  let i = startIndex;

  // 收集连续的列表项
  while (i < lines.length && isListItem(lines[i].text.trim())) {
    listLines.push(lines[i]);
    i++;
  }

  // 格式化列表内容，确保每行都有正确的Markdown列表格式
  const content = listLines
    .map((line) => {
      const text = line.text.trim();
      // 如果已经是正确的Markdown格式，直接返回
      if (/^[-*+]\s+/.test(text) || /^\d+\.\s+/.test(text)) {
        return text;
      }
      // 否则添加Markdown列表标记
      return `- ${text.replace(/^[•·▪▫‣⁃]\s*/, "")}`;
    })
    .join("\n");

  return {
    block: {
      type: "list",
      content,
      lines: listLines,
    },
    nextIndex: i,
  };
}

/**
 * 提取代码块
 * @param lines 所有文本行
 * @param startIndex 开始索引
 * @returns 代码块和下一个索引
 */
function extractCodeBlock(
  lines: TextLine[],
  startIndex: number
): { block: ContentBlock; nextIndex: number } {
  const codeLines: TextLine[] = [];
  let i = startIndex;

  // 如果是```开始的代码块
  if (lines[i].text.trim().startsWith("```")) {
    codeLines.push(lines[i]);
    i++;
    // 查找结束的```
    while (i < lines.length && !lines[i].text.trim().startsWith("```")) {
      codeLines.push(lines[i]);
      i++;
    }
    // 添加结束标记
    if (i < lines.length) {
      codeLines.push(lines[i]); // 结束的```
      i++;
    }
  } else {
    // 缩进代码块：收集所有缩进的行
    while (i < lines.length && (isCodeLine(lines[i].text) || !lines[i].text.trim())) {
      if (lines[i].text.trim()) {
        // 跳过空行
        codeLines.push(lines[i]);
      }
      i++;
    }
  }

  let content = codeLines.map((line) => line.text).join("\n");

  // 确保代码块有正确的Markdown格式
  if (!content.startsWith("```")) {
    // 移除缩进并添加代码块标记
    const cleanedContent = codeLines
      .map((line) => line.text.replace(/^\s{4}/, "").replace(/^\t/, ""))
      .join("\n");
    content = `\`\`\`\n${cleanedContent}\n\`\`\``;
  }

  return {
    block: {
      type: "code",
      content,
      lines: codeLines,
    },
    nextIndex: i,
  };
}

/**
 * 提取引用块
 * @param lines 所有文本行
 * @param startIndex 开始索引
 * @returns 引用块和下一个索引
 */
function extractQuoteBlock(
  lines: TextLine[],
  startIndex: number
): { block: ContentBlock; nextIndex: number } {
  const quoteLines: TextLine[] = [];
  let i = startIndex;

  // 收集连续的引用行
  while (i < lines.length && (isQuote(lines[i].text.trim()) || !lines[i].text.trim())) {
    if (lines[i].text.trim()) {
      quoteLines.push(lines[i]);
    }
    i++;
  }

  // 清理引用标记并格式化
  const content = quoteLines
    .map((line) =>
      line.text
        .trim()
        .replace(/^>\s*/, "")
        .replace(/^["']\s*/, "")
    )
    .join("\n");

  return {
    block: {
      type: "quote",
      content,
      lines: quoteLines,
    },
    nextIndex: i,
  };
}

/**
 * 提取表格块
 * @param lines 所有文本行
 * @param startIndex 开始索引
 * @returns 表格块和下一个索引
 */
function extractTableBlock(
  lines: TextLine[],
  startIndex: number
): { block: ContentBlock; nextIndex: number } {
  const tableLines: TextLine[] = [];
  let i = startIndex;

  // 收集连续的表格行
  while (i < lines.length && isTableRow(lines[i])) {
    tableLines.push(lines[i]);
    i++;
  }

  // 转换为Markdown表格格式
  const rows = tableLines.map((line) => {
    const columns = line.text.split(/\s{3,}/).map((col) => col.trim());
    return "| " + columns.join(" | ") + " |";
  });

  // 添加表头分隔符（在第一行后）
  if (rows.length > 0) {
    const columnCount = tableLines[0].text.split(/\s{3,}/).length;
    const headerSeparator = "|" + " --- |".repeat(columnCount);
    rows.splice(1, 0, headerSeparator);
  }

  const content = rows.join("\n");

  return {
    block: {
      type: "table",
      content,
      lines: tableLines,
    },
    nextIndex: i,
  };
}

/**
 * 提取段落块
 * @param lines 所有文本行
 * @param startIndex 开始索引
 * @returns 段落块和下一个索引
 */
function extractParagraphBlock(
  lines: TextLine[],
  startIndex: number
): { block: ContentBlock; nextIndex: number } {
  const paragraphLines: TextLine[] = [];
  let i = startIndex;

  // 收集连续的非特殊格式行
  while (i < lines.length) {
    const line = lines[i];
    const text = line.text.trim();

    // 空行结束段落
    if (!text) {
      i++;
      break;
    }

    // 遇到其他类型的内容时停止
    if (
      isHeading(line, lines) ||
      isListItem(text) ||
      isCodeLine(text) ||
      isQuote(text) ||
      isTableRow(line)
    ) {
      break;
    }

    paragraphLines.push(line);
    i++;
  }

  // 合并段落文本，保持正确的空格分隔
  let content = paragraphLines
    .map((line) => line.text.trim())
    .filter((text) => text) // 过滤空文本
    .join(" ");

  // 应用文本样式
  content = applyTextStyles(content, paragraphLines);

  return {
    block: {
      type: "paragraph",
      content,
      lines: paragraphLines,
    },
    nextIndex: i,
  };
}

/**
 * 根据字体信息应用文本样式
 * @param content 文本内容
 * @param lines 文本行数组
 * @returns 应用样式后的文本
 */
function applyTextStyles(content: string, lines: TextLine[]): string {
  // 检查段落中是否有粗体或斜体文本
  const hasBold = lines.some((line) => line.isBold);
  const hasItalic = lines.some((line) => line.isItalic);

  // 如果整个段落都是粗体和斜体
  if (hasBold && hasItalic) {
    return `***${content}***`;
  } else if (hasBold) {
    return `**${content}**`;
  } else if (hasItalic) {
    return `*${content}*`;
  }

  return content;
}

/**
 * 生成最终的Markdown文档
 * @param blocks 内容块数组
 * @returns Markdown格式的字符串
 */
function generateMarkdown(blocks: ContentBlock[]): string {
  let markdown = "";

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        // 标题：添加对应数量的#号
        markdown += "#".repeat(block.level || 1) + " " + block.content + "\n\n";
        break;

      case "paragraph":
        // 段落：直接添加内容
        markdown += block.content + "\n\n";
        break;

      case "list":
        // 列表：确保格式正确
        markdown += block.content + "\n\n";
        break;

      case "code":
        // 代码块：确保有正确的代码块标记
        if (block.content.includes("```")) {
          markdown += block.content + "\n\n";
        } else {
          markdown += "```\n" + block.content + "\n```\n\n";
        }
        break;

      case "quote": {
        // 引用：为每行添加>标记
        const quotedContent = block.content
          .split("\n")
          .map((line) => "> " + line)
          .join("\n");
        markdown += quotedContent + "\n\n";
        break;
      }

      case "table":
        // 表格：直接使用格式化后的内容
        markdown += block.content + "\n\n";
        break;
    }
  }

  // 清理多余的空行，确保格式整洁
  return markdown.trim().replace(/\n{3,}/g, "\n\n");
}

/**
 * 主导出函数：从PDF文件提取文本并转换为Markdown
 * @param file PDF文件路径或数据
 * @returns Promise<string> 转换后的Markdown文本
 */
export async function getPdfText(file: string) {
  try {
    // 加载PDF文档
    const loadingTask = getDocument(file);
    const pdf = await loadingTask.promise;
    let fullText = "";

    // 逐页处理PDF内容
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // 使用增强的Markdown转换逻辑处理当前页
      const pageMarkdown = convertToMarkdown(textContent.items as PDFTextItem[]);

      if (pageMarkdown.trim()) {
        fullText += pageMarkdown;

        // 添加页面分隔符（除了最后一页）
        if (i < pdf.numPages) {
          fullText += "\n\n---\n\n";
        }
      }
    }

    return fullText;
  } catch (error) {
    console.error("PDF解析错误:", error);
    throw new Error(`PDF解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
