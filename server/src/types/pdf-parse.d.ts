// Type stub for pdf-parse v1.x
// npm 上没有 @types/pdf-parse（v1.1.1 太老），运行时使用 await import("pdf-parse")
// 这里是给 tsc --noEmit 用的最小类型声明

declare module "pdf-parse" {
  interface PdfData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    version: string;
    text: string;
  }
  function pdfParse(
    data: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PdfData>;
  export default pdfParse;
}
