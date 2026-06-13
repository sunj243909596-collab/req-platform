/** 需求分类树回归：树可读、非管理员 403、创建需求同步 reqType、父分类筛选含子类 */

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8001/api/v1";
const RUN_ID = Date.now().toString(36);

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

type CategoryNode = {
  id: number;
  name: string;
  reqType: string;
  isRoot: boolean;
  children: CategoryNode[];
};

function findRoot(tree: CategoryNode[], reqType: string): CategoryNode | undefined {
  return tree.find((n) => n.isRoot && n.reqType === reqType);
}

function findByName(nodes: CategoryNode[], name: string): CategoryNode | undefined {
  for (const n of nodes) {
    if (n.name === name) return n;
    const child = findByName(n.children, name);
    if (child) return child;
  }
  return undefined;
}

const adminToken = await login("admin", "admin123");
const memberToken = await login("member", "member123");

// 所有登录用户可读分类树
const { res: treeRes, body: treeBody } = await request("/requirements/categories", {
  headers: { Authorization: `Bearer ${memberToken}` },
});
if (!treeRes.ok || !Array.isArray(treeBody)) {
  throw new Error(`list categories failed: ${treeRes.status} ${JSON.stringify(treeBody)}`);
}
const tree = treeBody as CategoryNode[];
const reqRoot = findRoot(tree, "REQUIREMENT");
if (!reqRoot) throw new Error("missing REQUIREMENT root category");

// 非管理员不能创建分类
const { res: forbiddenRes } = await request("/requirements/categories", {
  method: "POST",
  headers: { Authorization: `Bearer ${memberToken}` },
  body: JSON.stringify({ parentId: reqRoot.id, name: `__forbidden_${RUN_ID}` }),
});
if (forbiddenRes.status !== 403) {
  throw new Error(`member create category expected 403, got ${forbiddenRes.status}`);
}

// 管理员创建子分类
const parentName = `回归父类_${RUN_ID}`;
const { res: parentRes, body: parentBody } = await request("/requirements/categories", {
  method: "POST",
  headers: { Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ parentId: reqRoot.id, name: parentName }),
});
if (!parentRes.ok) {
  throw new Error(`create parent category failed: ${parentRes.status} ${JSON.stringify(parentBody)}`);
}
const parentId = (parentBody as { id: number }).id;

const childName = `回归子类_${RUN_ID}`;
const { res: childRes, body: childBody } = await request("/requirements/categories", {
  method: "POST",
  headers: { Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ parentId, name: childName }),
});
if (!childRes.ok) {
  throw new Error(`create child category failed: ${childRes.status} ${JSON.stringify(childBody)}`);
}
const childId = (childBody as { id: number }).id;

// 在子分类下创建需求，reqType 应自动同步为 REQUIREMENT
const title = `分类回归需求_${RUN_ID}`;
const { res: createRes, body: created } = await request("/requirements", {
  method: "POST",
  headers: { Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({
    title,
    description: "category regression",
    categoryId: childId,
    priority: "P2",
    groupName: "WMS产品组",
  }),
});
if (!createRes.ok) {
  throw new Error(`create requirement failed: ${createRes.status} ${JSON.stringify(created)}`);
}
const req = created as { id: number; reqType: string; categoryId: number; categoryPath?: string };
if (req.reqType !== "REQUIREMENT") {
  throw new Error(`expected reqType REQUIREMENT, got ${req.reqType}`);
}
if (req.categoryId !== childId) {
  throw new Error(`expected categoryId ${childId}, got ${req.categoryId}`);
}
if (!req.categoryPath?.includes(parentName) || !req.categoryPath?.includes(childName)) {
  throw new Error(`unexpected categoryPath: ${req.categoryPath}`);
}

// 按父分类筛选应包含子分类下的需求
const { res: listRes, body: listBody } = await request(
  `/requirements?categoryId=${parentId}&search=${encodeURIComponent(title)}&pageSize=50`,
  { headers: { Authorization: `Bearer ${adminToken}` } }
);
if (!listRes.ok) {
  throw new Error(`list by parent category failed: ${listRes.status} ${JSON.stringify(listBody)}`);
}
const list = listBody as { data: { id: number }[] };
if (!list.data.some((r) => r.id === req.id)) {
  throw new Error("parent category filter did not include child-category requirement");
}

// 有需求时不可删除分类
const { res: delRes, body: delBody } = await request(`/requirements/categories/${childId}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${adminToken}` },
});
if (delRes.ok) {
  throw new Error(`delete category with requirements should fail, got ok: ${JSON.stringify(delBody)}`);
}

// 清理：软删需求后删子类、父类
await request(`/requirements/${req.id}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${adminToken}` },
});

const { res: tree2Res, body: tree2 } = await request("/requirements/categories", {
  headers: { Authorization: `Bearer ${adminToken}` },
});
if (!tree2Res.ok) throw new Error("reload categories failed");
const refreshed = tree2 as CategoryNode[];
const childNode = findByName(refreshed, childName);
const parentNode = findByName(refreshed, parentName);
if (childNode) {
  await request(`/requirements/categories/${childNode.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}
if (parentNode) {
  await request(`/requirements/categories/${parentNode.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

console.log("ok");
