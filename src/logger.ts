type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
};

const parseLogLevel = (): LogLevel => {
    const configured = process.env.LOG_LEVEL?.toLowerCase();
    if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
        return configured;
    }

    if (process.env.DEBUG === "true") {
        return "debug";
    }

    return "info";
};

const activeLevel = parseLogLevel();

const shouldLog = (level: LogLevel) => levelPriority[level] >= levelPriority[activeLevel];

function serializeError(error: unknown, seen = new WeakSet<object>()): Record<string, unknown> {
    if (error instanceof Error) {
        if (seen.has(error)) {
            return { name: error.name, message: error.message };
        }

        seen.add(error);
        const errorWithCause = error as Error & { cause?: unknown };
        const enumerableProperties = Object.fromEntries(Object.entries(error).filter(([key]) => key !== "cause"));

        return {
            ...enumerableProperties,
            name: error.name,
            message: error.message,
            ...(error.stack ? { stack: error.stack } : {}),
            ...(errorWithCause.cause !== undefined ? { cause: serializeError(errorWithCause.cause, seen) } : {})
        };
    }

    if (typeof error === "object" && error !== null) {
        if (seen.has(error)) {
            return { message: "[Circular value]" };
        }

        seen.add(error);
        return Object.fromEntries(
            Object.entries(error).map(([key, value]) => [key, key === "cause" ? serializeError(value, seen) : value])
        );
    }

    return { message: String(error) };
}

function normalizeContext(context?: Record<string, unknown>) {
    if (!context) {
        return undefined;
    }

    return Object.fromEntries(
        Object.entries(context).map(([key, value]) => [key, key === "error" ? serializeError(value) : value])
    );
}

function writeLog(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (!shouldLog(level)) {
        return;
    }

    const normalizedContext = normalizeContext(context);
    const payload = {
        ts: new Date().toISOString(),
        level,
        message,
        ...(normalizedContext ? { context: normalizedContext } : {})
    };

    const output = JSON.stringify(payload);
    if (level === "error") {
        console.error(output);
        return;
    }

    if (level === "warn") {
        console.warn(output);
        return;
    }

    console.log(output);
}

export const logger = {
    debug: (message: string, context?: Record<string, unknown>) => writeLog("debug", message, context),
    info: (message: string, context?: Record<string, unknown>) => writeLog("info", message, context),
    warn: (message: string, context?: Record<string, unknown>) => writeLog("warn", message, context),
    error: (message: string, context?: Record<string, unknown>) => writeLog("error", message, context)
};
