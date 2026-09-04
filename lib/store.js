import { DEFAULT_SAMPLES, SAMPLE_CHOICES } from './ping.js';

export const HISTORY_LIMIT = 20;
export const PIN_LIMIT = 6;
export const WATCH_LIMIT = 10;
export const INTERVAL_CHOICES = [1, 5, 15, 60];

export const DEFAULT_PINS = ['google.com', 'youtube.com', 'github.com'];

const DEFAULTS = {
    history: [],
    pins: DEFAULT_PINS,
    watches: [],
    settings: { samples: DEFAULT_SAMPLES },
};

// До 1.3 история лежала под другим ключом. Записи той поры совместимы по форме,
// им лишь нечего сказать про cold/warm/jitter — этого тогда не измеряли.
const LEGACY_HISTORY_KEY = 'pingHistory';

const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= 300;
const isNullableNumber = (value) => value === null || Number.isFinite(value);

function isRecord(value) {
    return Boolean(
        value &&
        typeof value === 'object' &&
        isText(value.label) &&
        isText(value.href) &&
        typeof value.ok === 'boolean' &&
        Number.isFinite(value.at) &&
        isNullableNumber(value.ms ?? null) &&
        isNullableNumber(value.status ?? null)
    );
}

function isWatch(value) {
    return Boolean(
        value &&
        typeof value === 'object' &&
        isText(value.label) &&
        isText(value.href) &&
        Number.isFinite(value.minutes) &&
        value.minutes > 0
    );
}

/**
 * Читает состояние и отбрасывает всё, что не совпало со схемой: хранилище
 * переживает обновления расширения, и доверять его содержимому нельзя.
 */
export async function readState() {
    let stored;
    try {
        stored = await chrome.storage.local.get({ ...DEFAULTS, [LEGACY_HISTORY_KEY]: null });
    } catch (error) {
        console.warn('Quick Ping: не удалось прочитать хранилище', error);
        return structuredClone(DEFAULTS);
    }

    const samples = stored.settings?.samples;

    const rawHistory = Array.isArray(stored.history) && stored.history.length > 0
        ? stored.history
        : stored[LEGACY_HISTORY_KEY];

    return {
        history: Array.isArray(rawHistory) ? rawHistory.filter(isRecord).slice(0, HISTORY_LIMIT) : [],
        pins: Array.isArray(stored.pins) ? stored.pins.filter(isText).slice(0, PIN_LIMIT) : [...DEFAULT_PINS],
        watches: Array.isArray(stored.watches) ? stored.watches.filter(isWatch).slice(0, WATCH_LIMIT) : [],
        settings: {
            samples: SAMPLE_CHOICES.includes(samples) ? samples : DEFAULT_SAMPLES,
        },
    };
}

export async function writeState(patch) {
    try {
        await chrome.storage.local.set(patch);
    } catch (error) {
        console.warn('Quick Ping: не удалось сохранить состояние', error);
    }
}
