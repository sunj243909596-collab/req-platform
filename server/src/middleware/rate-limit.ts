import type { MiddlewareHandler } from "hono";

interface RateLimitOptions {
  windowMs: number;   // 时间窗口（毫秒）
  max: number;        // 窗口内最大请求数
  keyFn?: (c: Parameters<MiddlewareHandler>[0]) => string;
  message?: string;
}

function createRateLimiter(opts: RateLimitOptions): MiddlewareHandler {
  const { windowMs, max, message = "请求过于频繁，请稍后再试" } = opts;
  const store = new Map<string, { count: number; resetAt: number }>();

  // 每分钟清理一次过期记录，防内存泄漏
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of store) {
      if (now > val.resetAt) store.delete(key);
    }
  }, 60_000);

  return async (c, next) => {
    const key = opts.keyFn
      ? opts.keyFn(c)
      : (c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown");

    const now = Date.now();
    const record = store.get(key);

    if (!record || now > record.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count += 1;
    if (record.count > max) {
      c.header("Retry-After", String(Math.ceil((record.resetAt - now) / 1000)));
      return c.json({ error: message }, 429);
    }
    return next();
  };
}

/** 登录接口：5次/分钟（防暴力破解） */
export const loginRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: "登录尝试过于频繁，请 1 分钟后再试",
  keyFn: (c) => {
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    // 同一 IP + username 组合计数
    try {
      const body = c.req.raw.clone();
      return ip; // 仅按 IP 限制，username 在异步 body 中不便同步读取
    } catch {
      return ip;
    }
  },
});

/** AI 接口：每用户 20次/分钟（防预算耗尽） */
export const aiRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: "AI 请求过于频繁，请 1 分钟后再试",
  keyFn: (c) => `ai:${c.get("userId") ?? c.req.header("x-forwarded-for") ?? "unknown"}`,
});

/** 通用接口：100次/分钟/IP */
export const generalRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 100,
  message: "请求过于频繁，请稍后再试",
});

/** 改密接口：3次/分钟/用户（既防爆破，也保护审计日志写入） */
export const changePasswordLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 3,
  message: "改密尝试过于频繁，请 1 分钟后再试",
  keyFn: (c) => `pwd:user:${c.get("userId") ?? c.req.header("x-forwarded-for") ?? "unknown"}`,
});
