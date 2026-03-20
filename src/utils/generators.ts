import { createId } from '@paralleldrive/cuid2';

export const generateUuidV4 = (): string => crypto.randomUUID();

export const generateCuid2 = (): string => createId();

const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const generateUlid = (): string => {
    const now = Date.now();
    const rand = crypto.getRandomValues(new Uint8Array(16));

    let ts = '';
    let t = now;
    for (let i = 9; i >= 0; i--) {
        ts = ULID_CHARS[t % 32] + ts;
        t = Math.floor(t / 32);
    }

    let rnd = '';
    for (let i = 0; i < 16; i++) {
        rnd += ULID_CHARS[rand[i] & 0x1f];
    }

    return ts + rnd;
};

export const generateUuidV7 = (): string => {
    const timestamp = BigInt(Date.now());
    const bytes = crypto.getRandomValues(new Uint8Array(16));

    bytes[0] = Number((timestamp >> 40n) & 0xffn);
    bytes[1] = Number((timestamp >> 32n) & 0xffn);
    bytes[2] = Number((timestamp >> 24n) & 0xffn);
    bytes[3] = Number((timestamp >> 16n) & 0xffn);
    bytes[4] = Number((timestamp >> 8n) & 0xffn);
    bytes[5] = Number(timestamp & 0xffn);

    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
