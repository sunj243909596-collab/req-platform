import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import * as svc from "../services/requirement-number-rule.service";

function reqTypeFromQuery(c: { req: { query: (k: string) => string | undefined } }): string {
  const code = c.req.query("reqType")?.trim();
  if (!code) throw new Error("请指定 reqType 参数");
  return code;
}

export function createRequirementNumberRuleRoutes() {
  const app = new Hono();

  app.get("/", async (c) => {
    try {
      return c.json(await svc.getRule(reqTypeFromQuery(c)));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.get("/counters", async (c) => {
    try {
      return c.json(await svc.listSeqCounters(reqTypeFromQuery(c)));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.put("/", requireRole("ADMIN"), async (c) => {
    const body = await c.req.json();
    try {
      const rule = await svc.updateRule(reqTypeFromQuery(c), {
        enabled: !!body.enabled,
        prefix: String(body.prefix ?? ""),
      });
      return c.json(rule);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  return app;
}
