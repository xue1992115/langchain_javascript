/**
 * 知识文档加载器
 *
 * 支持从以下来源加载文档：
 *   1. 内置知识库（knowledge-base.js）
 *   2. PDF 文件（src/knowledge/*.pdf）
 *   3. 纯文本文件（src/knowledge/*.txt）
 *
 * 使用方式：
 *   - 将 PDF 放入 src/knowledge/ 目录
 *   - 调用 POST /api/rag/rebuild 重建索引
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { execSync } from "child_process";
import { join, extname, basename } from "path";
import { fileURLToPath } from "url";
import { Document } from "@langchain/core/documents";
import { getKnowledgeDocuments } from "./knowledge-base.js";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const KNOWLEDGE_DIR = join(__dirname, "..", "knowledge");

// ======================== PDF 解析 ========================

/**
 * 使用 macOS 内置 textutil 命令提取 PDF 文本
 * textutil 是 macOS 自带的文档格式转换工具，无需安装额外依赖
 */
function parsePDFWithTextutil(filePath) {
  try {
    const stdout = execSync(
      `textutil -convert txt -stdout "${filePath}" 2>/dev/null`,
      { encoding: "utf-8", timeout: 30000 }
    );

    const text = (stdout || "").trim();
    if (!text || text.length < 20) return null;

    // 按分页符分割
    const pages = text
      .split(/\f|\n{3,}(?=[A-Z一-鿿])/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    return {
      fullText: text,
      pages: pages.length > 0 ? pages : [text],
      pageCount: Math.max(pages.length, 1),
      metadata: {},
    };
  } catch {
    return null;
  }
}

/**
 * 使用 pdf-parse 库解析 PDF（如果已安装）
 */
async function parsePDFWithLib(filePath) {
  try {
    const { default: pdfParse } = await import("pdf-parse");
    const buffer = readFileSync(filePath);
    const data = await pdfParse(buffer);

    const pages = (data.text || "")
      .split(/\f/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    if (pages.length === 0) return null;

    return {
      fullText: data.text.trim(),
      pages,
      pageCount: data.numpages || pages.length,
      metadata: data.info || {},
    };
  } catch {
    return null;
  }
}

/**
 * 解析 PDF 文件提取文本
 * 依次尝试：pdf-parse 库 → macOS textutil 命令
 */
async function parsePDF(filePath) {
  // 1) 优先尝试 pdf-parse 库（语义更好）
  const libResult = await parsePDFWithLib(filePath);
  if (libResult) return libResult;

  // 2) 降级到 macOS textutil
  const cmdResult = parsePDFWithTextutil(filePath);
  if (cmdResult) {
    console.log("[知识加载器] 📎 使用 textutil 解析 PDF");
    return cmdResult;
  }

  console.warn(`[知识加载器] ⚠️ 无法解析 PDF: ${filePath}`);
  return null;
}

// ======================== 文件扫描 ========================

/**
 * 获取 knowledge 目录下所有支持的文件
 */
function getExternalFiles() {
  if (!existsSync(KNOWLEDGE_DIR)) {
    return [];
  }

  return readdirSync(KNOWLEDGE_DIR)
    .filter((file) => {
      const ext = extname(file).toLowerCase();
      return [".pdf", ".txt"].includes(ext);
    })
    .map((file) => ({
      path: join(KNOWLEDGE_DIR, file),
      name: basename(file, extname(file)),
      ext: extname(file).toLowerCase(),
      size: statSync(join(KNOWLEDGE_DIR, file)).size,
    }))
    .filter((f) => f.size > 0); // 跳过空文件
}

// ======================== 文档加载 ========================

/**
 * 加载单个外部文件为 Document[]
 */
async function loadFile(fileInfo) {
  const { path, name, ext } = fileInfo;

  if (ext === ".pdf") {
    const result = await parsePDF(path);
    if (!result) return [];

    console.log(
      `[知识加载器] 📕 加载 PDF: ${name} (${result.pageCount} 页, ${result.fullText.length} 字符)`
    );

    // PDF 作为单个文档（保持上下文完整）
    return [
      new Document({
        pageContent: result.fullText,
        metadata: {
          id: `pdf:${name}`,
          title: name,
          category: "PDF文档",
          source: `knowledge/${name}.pdf`,
          pageCount: result.pageCount,
          fileSize: fileInfo.size,
        },
      }),
    ];
  }

  if (ext === ".txt") {
    const content = readFileSync(path, "utf-8").trim();
    if (!content) return [];

    console.log(
      `[知识加载器] 📄 加载文本: ${name} (${content.length} 字符)`
    );

    return [
      new Document({
        pageContent: content,
        metadata: {
          id: `txt:${name}`,
          title: name,
          category: "文本资料",
          source: `knowledge/${name}.txt`,
          fileSize: fileInfo.size,
        },
      }),
    ];
  }

  return [];
}

// ======================== 公开 API ========================

/**
 * 加载所有文档（内置知识库 + 外部文件）
 *
 * @param {object} [options]
 * @param {boolean} [options.includeBuiltin=true] - 是否包含内置知识库
 * @returns {Promise<Document[]>}
 */
export async function loadAllDocuments(options = {}) {
  const { includeBuiltin = true } = options;
  const allDocs = [];

  // 1. 内置知识库
  if (includeBuiltin) {
    const builtinDocs = getKnowledgeDocuments();
    allDocs.push(...builtinDocs);
    console.log(
      `[知识加载器] 📚 内置知识库: ${builtinDocs.length} 篇文档`
    );
  }

  // 2. 外部文件（PDF / TXT）
  const externalFiles = getExternalFiles();
  if (externalFiles.length > 0) {
    console.log(
      `[知识加载器] 🔍 发现 ${externalFiles.length} 个外部文件`
    );

    for (const file of externalFiles) {
      try {
        const docs = await loadFile(file);
        allDocs.push(...docs);
      } catch (error) {
        console.error(
          `[知识加载器] ❌ 加载失败: ${file.name}:`,
          error.message
        );
      }
    }
  }

  return allDocs;
}

/**
 * 获取已注册的外部文件列表（不加载内容）
 */
export function listExternalFiles() {
  return getExternalFiles().map((f) => ({
    name: f.name,
    ext: f.ext,
    size: f.size,
    sizeKB: Math.round(f.size / 1024),
  }));
}

export default {
  loadAllDocuments,
  listExternalFiles,
};
