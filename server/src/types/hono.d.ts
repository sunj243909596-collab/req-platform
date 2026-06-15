declare module "hono" {
  interface ContextVariableMap {
    userId: number;
    username: string;
    role: string;
    groupName: string | null;
    isAdmin: boolean;
    permissions: Set<string>;
  }
}

export {};
