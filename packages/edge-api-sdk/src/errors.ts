// SDK 统一错误类型

export class EdgeApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly cause?: unknown) {
    super(message);
    this.name = "EdgeApiError";
  }
}

export class NotImplementedError extends EdgeApiError {
  constructor(method: string) {
    super(`EdgeAPI SDK method "${method}" not implemented (Phase 3 Step 1 placeholder)`, "NOT_IMPLEMENTED");
    this.name = "NotImplementedError";
  }
}
