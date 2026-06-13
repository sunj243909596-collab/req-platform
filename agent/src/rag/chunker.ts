// Text chunking strategies for different document types

export interface ChunkResult {
  content: string;
  metadata: {
    headingPath?: string;
    codeLanguage?: string;
    startLine?: number;
  };
}

/**
 * Split markdown by ## headings, each section becomes a chunk.
 * Sections larger than maxChars are split by paragraphs with overlap between chunks.
 */
export function chunkMarkdown(text: string, maxChars = 3000, overlap = 200): ChunkResult[] {
  const chunks: ChunkResult[] = [];

  const sections = text.split(/(?=^#{1,4}\s)/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const headingMatch = section.match(/^(#{1,4})\s+(.+)$/m);
    const headingPath = headingMatch ? headingMatch[2].trim() : undefined;

    if (section.length <= maxChars) {
      chunks.push({ content: section.trim(), metadata: { headingPath } });
      continue;
    }

    const paragraphs = section.split(/\n\n+/);
    let current = "";

    for (const para of paragraphs) {
      if (current.length + para.length > maxChars && current) {
        chunks.push({ content: current.trim(), metadata: { headingPath } });
        const tail = current.slice(-overlap);
        current = tail ? `${tail}\n\n${para}` : para;
      } else {
        current += (current ? "\n\n" : "") + para;
      }
    }
    if (current.trim()) {
      chunks.push({ content: current.trim(), metadata: { headingPath } });
    }
  }

  return chunks;
}

/**
 * Split plain text by paragraphs with overlap.
 */
export function chunkPlainText(text: string, maxChars = 2000, overlap = 200): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  const paragraphs = text.split(/\n\n+/);

  let current = "";
  for (const para of paragraphs) {
    if (current.length + para.length > maxChars && current) {
      chunks.push({ content: current.trim(), metadata: {} });
      // Overlap: keep last `overlap` chars
      current = current.slice(-overlap);
    }
    current += (current ? "\n\n" : "") + para;
  }
  if (current.trim()) {
    chunks.push({ content: current.trim(), metadata: {} });
  }

  return chunks;
}

/**
 * Split code by function/class boundaries.
 */
export function chunkCode(text: string, maxChars = 1500): ChunkResult[] {
  const chunks: ChunkResult[] = [];

  // Detect language
  let language = "text";
  if (text.includes("public class") || text.includes("import java")) language = "java";
  else if (text.includes("export const") || text.includes("interface ") || text.includes("import {")) language = "typescript";
  else if (text.includes("SELECT") || text.includes("CREATE TABLE")) language = "sql";
  else if (text.includes("<template>") && text.includes("<script")) language = "vue";

  // Split by function/method boundaries for TS/Java
  const funcRegex = /^\s*(export\s+)?(async\s+)?(function|class|interface|public\s+(static\s+)?(class|interface|void|String|int|boolean|long))/gm;
  const sections = text.split(/(?=^\s*(export\s+)?(async\s+)?(function|class|interface|public\s+))/m);

  for (const section of sections) {
    if (!section.trim()) continue;
    if (section.length <= maxChars) {
      chunks.push({ content: section.trim(), metadata: { codeLanguage: language } });
    } else {
      // Split by lines
      const lines = section.split("\n");
      let current = "";
      let startLine = 1;
      for (const line of lines) {
        if (current.length + line.length > maxChars && current) {
          chunks.push({ content: current.trim(), metadata: { codeLanguage: language, startLine } });
          current = line;
          startLine++;
        } else {
          current += (current ? "\n" : "") + line;
        }
      }
      if (current.trim()) {
        chunks.push({ content: current.trim(), metadata: { codeLanguage: language, startLine } });
      }
    }
  }

  return chunks;
}

/**
 * Auto-select chunking strategy based on file type.
 */
export function chunkDocument(
  fileName: string,
  content: string,
  maxChars?: number,
  mdOverlap = 200
): ChunkResult[] {
  const ext = fileName.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "md":
      return chunkMarkdown(content, maxChars || 3000, mdOverlap);
    case "sql":
    case "java":
    case "ts":
    case "tsx":
    case "vue":
      return chunkCode(content, maxChars || 1500);
    default:
      return chunkPlainText(content, maxChars || 2000);
  }
}
