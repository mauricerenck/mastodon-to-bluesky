import { BlobRef } from "@atproto/api";

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
        verified_at?: string | null;
    }[];
}

export interface MediaAttachment {
    id: string;
    type: string; // e.g. "image", "video", "audio", "gifv"
    url: string;
    preview_url: string;
    remote_url?: string | null;
    preview_remote_url?: string | null;
    text_url?: string | null;
    meta?: object;
    description?: string | null;
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
    website?: string | null;
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
    votes_count?: number | null;
    voted?: boolean;
    options: PollOption[];
}

export interface Status {
    id: string;
    created_at: string;
    in_reply_to_id?: string | null;
    in_reply_to_account_id?: string | null;
    sensitive: boolean;
    spoiler_text: string;
    visibility: "public" | "unlisted" | "private" | "direct";
    language?: string | null;
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
    text?: string | null; // plain-text source
    reblog?: Status | null; // nested original if boost/reblog
    application?: Application | null;
    account: Account;
    media_attachments: MediaAttachment[];
    mentions: Mention[];
    tags: Tag[];
    emojis: Emoji[];
    card?: PreviewCard | null;
    poll?: Poll | null;
    edited_at?: string | null;
    quote?: Status | null;
}

export type Attachment = {
    url: string;
    altText: string | null;
    type: "image" | "video";
    blob?: BlobRef;
};
