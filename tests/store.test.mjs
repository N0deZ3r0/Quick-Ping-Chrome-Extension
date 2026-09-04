/**
 * Хранилище переживает обновления расширения, поэтому читать его надо с
 * недоверием: схема могла смениться, а данные — испортиться. Здесь проверяется
 * и то, что мусор отбрасывается, и то, что история версии 1.2 не теряется.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

let store = {};

globalThis.chrome = {
    storage: {
        local: {
            async get(defaults) { return { ...defaults, ...store }; },
            async set(patch) { store = { ...store, ...patch }; },
        },
    },
};

const { readState, DEFAULT_PINS, HISTORY_LIMIT } = await import('../lib/store.js');

const record = (overrides = {}) => ({
    label: 'a.example.com',
    href: 'https://a.example.com/',
    ok: true,
    ms: 64,
    status: 200,
    at: 1_700_000_000_000,
    ...overrides,
});

test('пустое хранилище даёт значения по умолчанию', async () => {
    store = {};
    const state = await readState();

    assert.deepEqual(state.history, []);
    assert.deepEqual(state.pins, DEFAULT_PINS);
    assert.deepEqual(state.watches, []);
    assert.equal(state.settings.samples, 3);
});

test('история версии 1.2 подхватывается из старого ключа', async () => {
    store = { pingHistory: [record({ label: 'old.example.com' })] };
    const state = await readState();

    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].label, 'old.example.com');
});

test('новый ключ имеет приоритет над старым', async () => {
    store = {
        history: [record({ label: 'new.example.com' })],
        pingHistory: [record({ label: 'old.example.com' })],
    };
    const state = await readState();

    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].label, 'new.example.com');
});

test('записи не по схеме отбрасываются, годные остаются', async () => {
    store = {
        history: [
            record(),
            null,
            'строка вместо записи',
            { label: 'нет href', ok: true, at: 1 },
            record({ at: 'не число' }),
            record({ ok: 'да' }),
            record({ label: 'второй.example.com' }),
        ],
    };
    const state = await readState();

    assert.deepEqual(state.history.map((item) => item.label), ['a.example.com', 'второй.example.com']);
});

test('история подрезается до предела', async () => {
    store = { history: Array.from({ length: HISTORY_LIMIT + 15 }, () => record()) };
    const state = await readState();

    assert.equal(state.history.length, HISTORY_LIMIT);
});

test('неверное число замеров заменяется значением по умолчанию', async () => {
    store = { settings: { samples: 999 } };
    assert.equal((await readState()).settings.samples, 3);

    store = { settings: { samples: 5 } };
    assert.equal((await readState()).settings.samples, 5);
});

test('наблюдение без интервала не проходит проверку', async () => {
    store = {
        watches: [
            { href: 'https://a.example.com/', label: 'a.example.com', minutes: 5 },
            { href: 'https://b.example.com/', label: 'b.example.com' },
            { href: 'https://c.example.com/', label: 'c.example.com', minutes: 0 },
        ],
    };
    const state = await readState();

    assert.deepEqual(state.watches.map((item) => item.label), ['a.example.com']);
});

test('сбой хранилища не роняет попап', async () => {
    const original = chrome.storage.local.get;
    chrome.storage.local.get = async () => { throw new Error('storage unavailable'); };

    const state = await readState();
    assert.deepEqual(state.history, []);
    assert.deepEqual(state.pins, DEFAULT_PINS);

    chrome.storage.local.get = original;
});
