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

function writeLog(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (!shouldLog(level)) {
        return;
    }

    const payload = {
        ts: new Date().toISOString(),
        level,
        message,
        ...(context ? { context } : {})
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
