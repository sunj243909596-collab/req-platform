/**
 * 用户改密相关错误（带 HTTP 状态码与字段级定位）
 * 用户域与路由层抛 / 抓，统一错误码便利前端 mapping。
 */
export class UserError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly http: number = 400,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export const UserErr = {
  oldMismatch: () =>
    new UserError("OLD_PASSWORD_MISMATCH", "当前密码不正确", 400, "currentPassword"),
  sameAsOld: () =>
    new UserError("PASSWORD_UNCHANGED", "新密码不能与旧密码相同", 400, "newPassword"),
  confirmMismatch: () =>
    new UserError("CONFIRM_MISMATCH", "两次输入的新密码不一致", 400, "confirmPassword"),
  missingField: (n: string) =>
    new UserError("MISSING_FIELD", `缺少必填字段: ${n}`, 400, n),
  tokenRevoked: () =>
    new UserError("TOKEN_REVOKED", "会话已失效，请重新登录", 401),
  userNotFound: () =>
    new UserError("USER_NOT_FOUND", "用户不存在", 404),
  userDisabled: () =>
    new UserError("USER_DISABLED", "账户已停用", 403),
  weakPassword: (msg: string) =>
    new UserError("WEAK_PASSWORD", msg, 400, "newPassword"),
} as const;
