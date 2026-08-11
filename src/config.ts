type IntConfig = {
    defaultValue: number;
    min: number;
    max: number;
};

export function getIntegerEnv(name: string, config: IntConfig): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === "") {
        return config.defaultValue;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed)) {
        throw new Error(`${name} must be an integer.`);
    }

    if (parsed < config.min || parsed > config.max) {
        throw new Error(`${name} must be between ${config.min} and ${config.max}.`);
    }

    return parsed;
}
