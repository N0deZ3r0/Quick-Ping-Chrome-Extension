/**
 * Фоновое наблюдение проверяется без Chrome: chrome.* и fetch подменяются,
 * дальше дёргается слушатель будильника и проверяется, что записалось в
 * хранилище и какие уведомления ушли.
 *
 * Самое важное здесь — не «падение замечено», а обратное: что уведомление
 * приходит ровно на смену состояния. Если слать его на каждую проверку,
 * от наблюдения отпишутся в первый же час.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
const notifications = [];
const alarms = new Map();

let store = {};
let respond = () => new Response('', { status: 200 });

globalThis.chrome = {
    runtime: {
        onInstalled: { addListener: (fn) => (listeners.installed = fn) },
        onStartup: { addListener: (fn) => (listeners.startup = fn) },
        getURL: (path) => `chrome-extension://test/${path}`,
    },
    storage: {
        local: {
            async get(defaults) { return { ...defaults, ...store }; },
            async set(patch) { store = { ...store, ...patch }; },
        },
        onChanged: { addListener: (fn) => (listeners.storage = fn) },
    },
    alarms: {
        async create(name, options) { alarms.set(name, options); },
        async get(name) { return alarms.has(name) ? { name, ...alarms.get(name) } : undefined; },
        async clear(name) { return alarms.delete(name); },
        onAlarm: { addListener: (fn) => (listeners.alarm = fn) },
    },
    notifications: {
        create: (id, options) => notifications.push(options),
        clear: () => {},
        onClicked: { addListener: (fn) => (listeners.clicked = fn) },
    },
    i18n: {
        getUILanguage: () => 'en',
        getMessage: (key, subs = []) => `${key}(${subs.join(',')})`,
    },
};

globalThis.fetch = async () => respond();

await import('../background.js');

const ALARM = 'quick-ping-watch';
const LONG_AGO = () => Date.now() - 3_600_000;

/** Слушатель будильника ничего не возвращает — ждём, пока осядут промисы. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const tick = async () => {
    await listeners.alarm({ name: ALARM });
    await settle();
};

const watching = (overrides = {}) => ({
    href: 'https://a.example.com/',
    label: 'a.example.com',
    minutes: 5,
    state: 'up',
    checkedAt: LONG_AGO(),
    ...overrides,
});

test.beforeEach(() => {
    notifications.length = 0;
    alarms.clear();
    respond = () => new Response('', { status: 200 });
});

test('без наблюдений будильник не заводится', async () => {
    store = { watches: [] };
    await listeners.installed();
    assert.equal(alarms.has(ALARM), false);
});

test('появление наблюдения заводит будильник', async () => {
    store = { watches: [watching()] };
    await listeners.storage({ watches: {} }, 'local');
    await settle();
    assert.deepEqual(alarms.get(ALARM), { periodInMinutes: 1 });
});

test('падение хоста меняет состояние и шлёт уведомление', async () => {
    store = { watches: [watching()] };
    respond = () => { throw new TypeError('Failed to fetch'); };

    await tick();

    assert.equal(store.watches[0].state, 'down');
    assert.equal(store.watches[0].reason, 'network');
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, 'notifyDownTitle()');
});

test('пока хост лежит, уведомление не повторяется', async () => {
    store = { watches: [watching({ state: 'down' })] };
    respond = () => { throw new TypeError('Failed to fetch'); };

    await tick();
    await tick();

    assert.equal(store.watches[0].state, 'down');
    assert.equal(notifications.length, 0);
});

test('возвращение хоста тоже уведомляет', async () => {
    store = { watches: [watching({ state: 'down' })] };

    await tick();

    assert.equal(store.watches[0].state, 'up');
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, 'notifyUpTitle()');
});

test('до истечения интервала хост не трогается', async () => {
    const checkedAt = Date.now();
    store = { watches: [watching({ checkedAt })] };

    await tick();

    assert.equal(store.watches[0].checkedAt, checkedAt);
});

test('самая первая проверка не считается сменой состояния', async () => {
    store = { watches: [watching({ state: 'unknown', checkedAt: null })] };

    await tick();

    assert.equal(store.watches[0].state, 'up');
    assert.equal(notifications.length, 0);
});

test('опустевший список наблюдения снимает будильник', async () => {
    alarms.set(ALARM, { periodInMinutes: 1 });
    store = { watches: [] };

    await tick();

    assert.equal(alarms.has(ALARM), false);
});
