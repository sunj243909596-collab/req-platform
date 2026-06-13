/** RAG 管理员权限回归：非管理员不能修改路由/回答提示词和知识库路由元数据 */

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8001/api/v1";

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function login(username: string, password: string): Promise<string> {
  const { res, body } = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  const token = (body as { token?: string } | null)?.token;
  if (!res.ok || !token) {
    throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(body)}`);
  }
  return token;
}

async function expectForbidden(label: string, path: string, token: string, body: unknown) {
  const { res, body: responseBody } = await request(path, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status !== 403) {
    throw new Error(`${label} expected 403, got ${res.status}: ${JSON.stringify(responseBody)}`);
  }
}

async function expectPostForbidden(label: string, path: string, token: string, body: unknown) {
  const { res, body: responseBody } = await request(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status !== 403) {
    throw new Error(`${label} expected 403, got ${res.status}: ${JSON.stringify(responseBody)}`);
  }
}

const memberToken = await login("member", "member123");

await expectForbidden("kb routing prompt", "/agent/config", memberToken, {
  kbRoutingSystemPrompt: "__forbidden_by_regression__",
});

await expectForbidden("answer system prompt", "/agent/config", memberToken, {
  systemPrompts: { chat: "__forbidden_by_regression__" },
});

await expectPostForbidden(
  "optimize kb routing prompt",
  "/agent/config/optimize-kb-routing-prompt",
  memberToken,
  { currentPrompt: "test" }
);

await expectPostForbidden(
  "optimize answer system prompt",
  "/agent/config/optimize-system-prompt",
  memberToken,
  { key: "chat", currentPrompt: "test" }
);

const { res: basesRes, body: basesBody } = await request("/knowledge/bases", {
  headers: { Authorization: `Bearer ${memberToken}` },
});
if (!basesRes.ok || !Array.isArray(basesBody)) {
  throw new Error(`list knowledge bases failed: ${basesRes.status} ${JSON.stringify(basesBody)}`);
}

const firstKb = basesBody.find((kb: { id?: unknown }) => typeof kb.id === "number") as
  | { id: number }
  | undefined;
if (firstKb) {
  await expectForbidden("knowledge routing metadata", `/knowledge/bases/${firstKb.id}`, memberToken, {
    description: "__forbidden_by_regression__",
    routingExamples: [{ question: "test", kbIds: [firstKb.id], reason: "test" }],
  });
}

console.log("ok");
