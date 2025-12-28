import { BlobRef } from "@atproto/api";

type Nullable<T> = null | T;

export type MastodonSettings = {
    url: string;
    username: string;
};

export interface Account {
    id: string;
    username: string;
    acct: string;
    display_name: string;
    url: string;
    avatar: string;
    header: string;
    note: string;
    followers_count: number;
    following_count: number;
    statuses_count: number;
    last_status_at: string;
    noindex?: boolean;
    emojis: unknown[];
    fields?: {
        name: string;
        value: string;
        verified_at?: Nullable<string>;
    }[];
}

export interface MediaAttachment {
    id: string;
    type: string; // e.g. "image", "video", "audio", "gifv"
    url: string;
    preview_url: string;
    remote_url?: Nullable<string>;
    preview_remote_url?: Nullable<string>;
    text_url?: Nullable<string>;
    meta?: object;
    description?: Nullable<string>;
}

export interface Mention {
    id: string;
    username: string;
    url: string;
    acct: string;
}

export interface Tag {
    name: string;
    url: string;
}

export interface Emoji {
    shortcode: string;
    url: string;
    static_url: string;
    visible_in_picker?: boolean;
}

export interface Application {
    name: string;
    website?: Nullable<string>;
}

export interface PreviewCard {
    type: string;
    title?: string;
    description?: string;
    url: string;
    image?: string;
    media_type?: string;
    html?: string;
    author_name?: string;
    provider_name?: string;
}

export interface PollOption {
    title: string;
    votes_count: number;
}

export interface Poll {
    id: string;
    expires_at: string;
    expired: boolean;
    multiple: boolean;
    votes_count?: Nullable<number>;
    voted?: boolean;
    options: PollOption[];
}

export interface Status {
    id: string;
    created_at: string;
    in_reply_to_id?: Nullable<string>;
    in_reply_to_account_id?: Nullable<string>;
    sensitive: boolean;
    spoiler_text: string;
    visibility: "public" | "unlisted" | "private" | "direct";
    language?: Nullable<string>;
    uri: string;
    url: string;
    replies_count: number;
    reblogs_count: number;
    favourites_count: number;
    favourited?: boolean;
    reblogged?: boolean;
    muted?: boolean;
    bookmarked?: boolean;
    pinned?: boolean;
    content: string; // HTML
    text?: Nullable<string>; // plain-text source
    reblog?: Nullable<Status>; // nested original if boost/reblog
    application?: Nullable<Application>;
    account: Account;
    media_attachments: MediaAttachment[];
    mentions: Mention[];
    tags: Tag[];
    emojis: Emoji[];
    card?: Nullable<PreviewCard>;
    poll?: Nullable<Poll>;
    edited_at?: Nullable<string>;
    quote?: Nullable<Status>;
}

export type Attachment = {
    url: string;
    altText: Nullable<string>;
    type: "image" | "video";
    mimeType: string; // e.g. "image/jpeg"
    blob?: BlobRef;
};
