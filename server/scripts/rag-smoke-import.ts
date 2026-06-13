/** RAG smoke：关键模块导入和配置读取必须快速完成 */

async function withTimeout<T>(label: string, task: Promise<T>, ms = 3000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const agent = await withTimeout("import agent", import("agent"));
if (typeof agent.getSystemPrompt !== "function") {
  throw new Error("agent.getSystemPrompt missing");
}

const cfgService = await withTimeout(
  "import agent-config.service",
  import("../src/services/agent-config.service.ts")
);
const cfg = cfgService.readConfig();
if (!cfg.rag || !Object.prototype.hasOwnProperty.call(cfg, "systemPrompts")) {
  throw new Error("readConfig missing RAG/system prompt config");
}

const resolver = await withTimeout(
  "import system-prompt-resolver",
  import("../src/services/system-prompt-resolver.ts")
);
const prompt = resolver.resolveSystemPrompt("chat", undefined, cfg);
if (!prompt.includes("当前日期")) {
  throw new Error("resolved prompt missing date suffix");
}

console.log("ok");
