export type BlueSkySettings = {
    url: string;
    handle: string;
    password: string;
    maxPostLength: number;
};

export type BlueskyPostReference = {
    uri: string;
    cid: string;
};

export type BlueskyThreadReference = {
    root: BlueskyPostReference;
    parent: BlueskyPostReference;
};
