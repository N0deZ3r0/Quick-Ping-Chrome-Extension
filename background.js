/**
 * Фоновая проверка наблюдаемых хостов.
 *
 * Попап живёт только пока открыт, поэтому наблюдение держится на будильнике:
 * chrome.alarms будит service worker, тот проверяет те хосты, чей интервал
 * истёк, и присылает уведомление, когда состояние сменилось. Уведомление
 * приходит на смену состояния, а не на каждую проверку — иначе от него
 * пришлось бы сразу отписаться.
 */

import { measure } from './lib/ping.js';
import { readState, writeState } from './lib/store.js';
import { t } from './lib/i18n.js';

const ALARM_NAME = 'quick-ping-watch';
// Минимальный период, который Chrome гарантирует упакованному расширению.
const TICK_MINUTES = 1;

chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(syncAlarm);

// Попап меняет список наблюдения через storage — отдельный канал сообщений не нужен.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.watches) syncAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) runDueWatches();
});

chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.notifications.clear(notificationId);
});

async function syncAlarm() {
    const { watches } = await readState();

    if (watches.length === 0) {
        await chrome.alarms.clear(ALARM_NAME);
        return;
    }

    const existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) {
        await chrome.alarms.create(ALARM_NAME, { periodInMinutes: TICK_MINUTES });
    }
}

async function runDueWatches() {
    const state = await readState();
    if (state.watches.length === 0) {
        await chrome.alarms.clear(ALARM_NAME);
        return;
    }

    const now = Date.now();
    const transitions = [];

    const watches = [...state.watches];

    for (let index = 0; index < watches.length; index += 1) {
        const watch = watches[index];
        const due = !Number.isFinite(watch.checkedAt) || now - watch.checkedAt >= watch.minutes * 60_000;
        if (!due) continue;

        // Одна выборка: фоновая проверка отвечает на вопрос "жив или нет",
        // а не на "насколько быстро" — точность там ни к чему.
        const outcome = await measure(watch.href, { samples: 1 });
        const nextState = outcome.ok ? 'up' : 'down';
        const previousState = watch.state ?? 'unknown';

        watches[index] = {
            ...watch,
            state: nextState,
            ms: outcome.ok ? outcome.ms : null,
            status: outcome.ok ? outcome.status : null,
            reason: outcome.ok ? null : outcome.reason,
            checkedAt: Date.now(),
        };

        if (previousState !== 'unknown' && previousState !== nextState) {
            transitions.push({ watch: watches[index], nextState });
        }
    }

    await writeState({ watches });

    for (const transition of transitions) {
        notify(transition.watch, transition.nextState);
    }
}

function notify(watch, nextState) {
    const isUp = nextState === 'up';

    chrome.notifications.create(`quick-ping-${watch.href}-${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: isUp ? t('notifyUpTitle') : t('notifyDownTitle'),
        message: isUp ? t('notifyUp', watch.label, watch.ms ?? 0) : t('notifyDown', watch.label),
        priority: isUp ? 0 : 2,
    });
}
