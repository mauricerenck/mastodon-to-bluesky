import type { Status } from "./mastodon/types.js";

export type ThreadedStatus = {
    status: Status;
    continuesThread: boolean;
};

/**
 * Builds a chronological posting plan that keeps root posts and only those replies
 * that are direct consecutive replies to the immediately previous status.
 */
export const buildConsecutiveThreadPlan = (statusesNewestFirst: readonly Status[]): ThreadedStatus[] => {
    const statusesInChronologicalOrder = [...statusesNewestFirst].reverse();
    const plan: ThreadedStatus[] = [];

    for (let index = 0; index < statusesInChronologicalOrder.length; index++) {
        const status = statusesInChronologicalOrder[index];
        const previousStatus = index > 0 ? statusesInChronologicalOrder[index - 1] : null;
        const continuesThread = status.in_reply_to_id !== null && previousStatus !== null && status.in_reply_to_id === previousStatus.id;

        if (status.in_reply_to_id === null || continuesThread) {
            plan.push({
                status,
                continuesThread
            });
        }
    }

    return plan;
};
