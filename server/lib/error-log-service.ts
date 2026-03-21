import fs from "fs";
import path from "path";

type ErrorLogLevel = "error" | "fatal";

interface ErrorLogContext {
  source?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: string | null;
  requestId?: string | null;
  body?: unknown;
  query?: unknown;
  params?: unknown;
  extra?: Record<string, unknown>;
}

interface ErrorLogEntry {
  timestamp: string;
  level: ErrorLogLevel;
  message: string;
  stack?: string;
  source?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: string | null;
  requestId?: string | null;
  body?: unknown;
  query?: unknown;
  params?: unknown;
  extra?: Record<string, unknown>;
}

const LOG_DIR = path.resolve("logs");
const ERROR_LOG_PATH = path.join(LOG_DIR, "app-errors.ndjson");
const MAX_STRING_LENGTH = 2000;

let initialized = false;
let consolePatched = false;
let processHandlersInstalled = false;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function sanitizeValue(value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message || ""),
      stack: value.stack ? truncateString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("authorization") ||
        lowerKey.includes("cookie")
      ) {
        output[key] = "[redacted]";
        continue;
      }
      if (lowerKey.includes("filedata") || lowerKey.includes("pdfbase64") || lowerKey.includes("rawbody")) {
        output[key] = "[omitted large payload]";
        continue;
      }
      output[key] = sanitizeValue(raw);
    }
    return output;
  }

  return String(value);
}

function coerceError(message: string, error?: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message || message,
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return { message: error, stack: undefined };
  }

  if (error && typeof error === "object") {
    return {
      message,
      stack: truncateString(JSON.stringify(sanitizeValue(error))),
    };
  }

  return { message, stack: undefined };
}

export function getErrorLogPath() {
  ensureLogDir();
  return ERROR_LOG_PATH;
}

export function logAppError(message: string, error?: unknown, context: ErrorLogContext = {}) {
  ensureLogDir();
  const normalized = coerceError(message, error);
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    level: context.statusCode && context.statusCode >= 500 ? "fatal" : "error",
    message: truncateString(normalized.message),
    stack: normalized.stack ? truncateString(normalized.stack) : undefined,
    source: context.source,
    path: context.path,
    method: context.method,
    statusCode: context.statusCode,
    userId: context.userId ?? null,
    requestId: context.requestId ?? null,
    body: sanitizeValue(context.body),
    query: sanitizeValue(context.query),
    params: sanitizeValue(context.params),
    extra: sanitizeValue(context.extra) as Record<string, unknown> | undefined,
  };

  try {
    fs.appendFileSync(ERROR_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (writeError) {
    process.stderr.write(`[ErrorLog] Failed to write error log: ${String(writeError)}\n`);
  }
}

export function installErrorLogCapture() {
  if (initialized) return;
  ensureLogDir();
  initialized = true;
}

export function patchConsoleError() {
  if (consolePatched) return;
  consolePatched = true;

  const originalConsoleError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    const [first, second, ...rest] = args;
    const message =
      typeof first === "string"
        ? first
        : first instanceof Error
          ? first.message
          : "console.error";

    const errorCandidate = first instanceof Error ? first : second instanceof Error ? second : undefined;

    logAppError(message, errorCandidate, {
      source: "console.error",
      extra: {
        args: sanitizeValue([first, second, ...rest]),
      },
    });

    originalConsoleError(...args);
  };
}

export function installProcessErrorHandlers() {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  process.on("unhandledRejection", (reason) => {
    logAppError("Unhandled promise rejection", reason, {
      source: "process.unhandledRejection",
      statusCode: 500,
    });
  });

  process.on("uncaughtException", (error) => {
    logAppError("Uncaught exception", error, {
      source: "process.uncaughtException",
      statusCode: 500,
    });
  });
}
