declare module "hono" {
  interface ContextVariableMap {
    userId: number;
    username: string;
    role: string;
    groupName: string | null;
  }
}

export {};
