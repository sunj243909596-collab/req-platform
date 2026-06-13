// 从磁盘读取文档正文（含 PDF）
import * as fs from "fs";
import * as path from "path";

export async function readDocumentText(filePath: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return (data.text || "").trim();
    } catch (err) {
      throw new Error(
        `PDF 解析失败 (${fileName}): ${(err as Error).message}。请确认已安装 pdf-parse 依赖。`
      );
    }
  }

  return fs.readFileSync(filePath, "utf-8");
}
