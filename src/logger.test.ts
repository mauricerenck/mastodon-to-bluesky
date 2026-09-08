import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger.js";

describe("logger", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("serializes Error details in JSON logs", () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const error = new Error("Request failed");
        Object.assign(error, { code: "E_REQUEST" });

        logger.error("Operation failed", { error, statusId: "status-1" });

        expect(consoleSpy).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
        expect(payload).toMatchObject({
            level: "error",
            message: "Operation failed",
            context: {
                error: {
                    name: "Error",
                    message: "Request failed",
                    code: "E_REQUEST",
                    stack: expect.any(String)
                },
                statusId: "status-1"
            }
        });
    });

    it("serializes error causes and non-Error throw values", () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const cause = new Error("Connection refused");
        const error = new Error("Request failed");
        Object.defineProperty(error, "cause", { value: cause });

        logger.error("Request failed", { error, secondaryError: "timeout" });
        logger.error("Unknown failure", { error: "plain failure" });

        const firstPayload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
        const secondPayload = JSON.parse(consoleSpy.mock.calls[1][0] as string);
        expect(firstPayload.context.error.cause).toMatchObject({
            name: "Error",
            message: "Connection refused",
            stack: expect.any(String)
        });
        expect(firstPayload.context.secondaryError).toBe("timeout");
        expect(secondPayload.context.error).toEqual({ message: "plain failure" });
    });
});
