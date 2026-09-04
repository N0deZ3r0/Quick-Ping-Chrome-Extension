import { element, icon, setIcon, setClass } from './lib/dom.js';
import { t, applyTranslations } from './lib/i18n.js';
import { parseTarget } from './lib/target.js';
import { measure, SAMPLE_CHOICES } from './lib/ping.js';
import {
    readState,
    writeState,
    HISTORY_LIMIT,
    PIN_LIMIT,
    WATCH_LIMIT,
    INTERVAL_CHOICES,
} from './lib/store.js';

const GOOD_THRESHOLD_MS = 100;
const MEDIUM_THRESHOLD_MS = 300;
const NOTIFICATION_TTL_MS = 3000;
const NOTIFICATION_LIMIT = 3;
const CLEAR_ARMED_MS = 3500;

const ui = {
    urlInput: document.getElementById('urlInput'),
    pingBtn: document.getElementById('pingBtn'),
    pingBtnIcon: document.getElementById('pingBtnIcon'),
    currentTabBtn: document.getElementById('currentTabBtn'),
    samplesSelect: document.getElementById('samplesSelect'),
    pinList: document.getElementById('pinList'),
    currentResult: document.getElementById('currentResult'),
    lastPing: document.getElementById('lastPing'),
    avgPing: document.getElementById('avgPing'),
    historyList: document.getElementById('historyList'),
    exportBtn: document.getElementById('exportBtn'),
    clearBtn: document.getElementById('clearBtn'),
    watchInput: document.getElementById('watchInput'),
    watchInterval: document.getElementById('watchInterval'),
    watchAddBtn: document.getElementById('watchAddBtn'),
    watchList: document.getElementById('watchList'),
    watchCount: document.getElementById('watchCount'),
    statusIcon: document.getElementById('statusIcon'),
    statusText: document.getElementById('statusText'),
    notifications: document.getElementById('notifications'),
    tabs: Array.from(document.querySelectorAll('.tab')),
    views: {
        check: document.getElementById('viewCheck'),
        watch: document.getElementById('viewWatch'),
    },
};

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

let state = { history: [], pins: [], watches: [], settings: { samples: 3 } };
let isPinging = false;
let clearArmedTimer = null;

init();

async function init() {
    applyTranslations();
    buildSelects();
    bindEvents();

    state = await readState();
    ui.samplesSelect.value = String(state.settings.samples);
    renderAll();
    setStatus(t('statusReady'), 'good');
    ui.urlInput.focus();
}

function buildSelects() {
    ui.samplesSelect.replaceChildren(
        ...SAMPLE_CHOICES.map((count) => element('option', { value: String(count), text: String(count) }))
    );

    ui.watchInterval.replaceChildren(
        ...INTERVAL_CHOICES.map((minutes) =>
            element('option', { value: String(minutes), text: t('intervalMinutes', minutes) })
        )
    );
    ui.watchInterval.value = String(INTERVAL_CHOICES[1]);
}

function bindEvents() {
    ui.pingBtn.addEventListener('click', () => startPing(ui.urlInput.value));
    ui.urlInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.isComposing) startPing(ui.urlInput.value);
    });

    ui.currentTabBtn.addEventListener('click', checkCurrentTab);
    ui.samplesSelect.addEventListener('change', async () => {
        state.settings = { samples: Number(ui.samplesSelect.value) };
        await writeState({ settings: state.settings });
    });

    ui.exportBtn.addEventListener('click', exportHistory);
    ui.clearBtn.addEventListener('click', handleClearClick);

    ui.watchAddBtn.addEventListener('click', () => addWatch(ui.watchInput.value));
    ui.watchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.isComposing) addWatch(ui.watchInput.value);
    });

    for (const tab of ui.tabs) {
        tab.addEventListener('click', () => switchView(tab.dataset.view));
    }

    // Фоновые проверки пишут в хранилище — держим открытый попап в курсе.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.watches) return;
        readState().then((fresh) => {
            state.watches = fresh.watches;
            renderWatches();
        });
    });
}

function switchView(name) {
    for (const tab of ui.tabs) tab.classList.toggle('is-active', tab.dataset.view === name);
    for (const [key, node] of Object.entries(ui.views)) node.hidden = key !== name;
    if (name === 'watch') ui.watchInput.focus();
    else ui.urlInput.focus();
}

/* ---------------------------------------------------------------------- *
 * Проверка
 * ---------------------------------------------------------------------- */

async function startPing(rawUrl) {
    if (isPinging) {
        notify(t('toastBusy'), 'info');
        return;
    }

    const target = parseTarget(rawUrl);
    if (!target) {
        notify(t('toastInvalidUrl'), 'error');
        ui.urlInput.focus();
        ui.urlInput.select();
        return;
    }

    setBusy(true);
    setStatus(t('statusChecking'), 'loading');

    try {
        const outcome = await measure(target.href, { samples: state.settings.samples });
        const record = { ...outcome, label: target.label, href: target.href };

        state.history = [record, ...state.history].slice(0, HISTORY_LIMIT);
        await writeState({ history: state.history });

        renderResult();
        renderStats();
        renderHistory();

        if (outcome.ok) {
            notify(t('toastResult', outcome.ms), outcome.degraded ? 'info' : 'success');
            setStatus(t('milliseconds', outcome.ms), toneFor(outcome.ms));
        } else {
            notify(outcome.reason === 'timeout' ? t('toastTimeout') : t('toastUnreachable'), 'error');
            setStatus(t('statusError'), 'bad');
        }
    } finally {
        setBusy(false);
    }
}

async function checkCurrentTab() {
    let tab;
    try {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
        notify(t('toastNoTab'), 'error');
        return;
    }

    const target = parseTarget(tab?.url ?? '');
    if (!target) {
        // chrome://, about:, страницы расширений — пинговать там нечего.
        notify(t('toastTabNotPingable'), 'error');
        return;
    }

    ui.urlInput.value = target.label;
    startPing(target.href);
}

/* ---------------------------------------------------------------------- *
 * Закреплённые адреса
 * ---------------------------------------------------------------------- */

async function addPin(raw) {
    const target = parseTarget(raw);
    if (!target) {
        notify(t('toastInvalidUrl'), 'error');
        return;
    }
    if (state.pins.includes(target.label)) {
        notify(t('toastPinExists'), 'info');
        return;
    }
    if (state.pins.length >= PIN_LIMIT) {
        notify(t('toastPinLimit', PIN_LIMIT), 'error');
        return;
    }

    state.pins = [...state.pins, target.label];
    await writeState({ pins: state.pins });
    renderPins();
    notify(t('toastPinAdded', target.label), 'success');
}

async function removePin(label) {
    state.pins = state.pins.filter((pin) => pin !== label);
    await writeState({ pins: state.pins });
    renderPins();
}

function renderPins() {
    const chips = state.pins.map((pin) =>
        element('div', { class: 'quick-btn' },
            element('button', {
                class: 'quick-btn-main',
                title: pin,
                text: pin,
                onClick: () => {
                    ui.urlInput.value = pin;
                    startPing(pin);
                },
            }),
            element('button', {
                class: 'quick-btn-remove',
                title: t('unpin', pin),
                'aria-label': t('unpin', pin),
                onClick: () => removePin(pin),
            }, icon('i-close', 'icon icon-xs'))
        )
    );

    if (state.pins.length < PIN_LIMIT) {
        chips.push(
            element('button', {
                class: 'quick-btn quick-btn-add',
                title: t('pinCurrent'),
                'aria-label': t('pinCurrent'),
                onClick: () => addPin(ui.urlInput.value),
            }, icon('i-plus', 'icon icon-sm'))
        );
    }

    ui.pinList.replaceChildren(...chips);
}

/* ---------------------------------------------------------------------- *
 * Наблюдение
 * ---------------------------------------------------------------------- */

async function addWatch(raw) {
    const target = parseTarget(raw);
    if (!target) {
        notify(t('toastInvalidUrl'), 'error');
        ui.watchInput.focus();
        ui.watchInput.select();
        return;
    }
    if (state.watches.some((watch) => watch.href === target.href)) {
        notify(t('toastWatchExists'), 'info');
        return;
    }
    if (state.watches.length >= WATCH_LIMIT) {
        notify(t('toastWatchLimit', WATCH_LIMIT), 'error');
        return;
    }

    const watch = {
        href: target.href,
        label: target.label,
        minutes: Number(ui.watchInterval.value),
        state: 'unknown',
        ms: null,
        status: null,
        reason: null,
        checkedAt: null,
    };

    state.watches = [...state.watches, watch];
    await writeState({ watches: state.watches });
    ui.watchInput.value = '';
    renderWatches();
    notify(t('toastWatchAdded', target.label), 'success');

    // Первая проверка сразу: она задаёт точку отсчёта, от которой service
    // worker потом заметит смену состояния.
    const outcome = await measure(target.href, { samples: 1 });
    const index = state.watches.findIndex((item) => item.href === target.href);
    if (index === -1) return;

    state.watches[index] = {
        ...state.watches[index],
        state: outcome.ok ? 'up' : 'down',
        ms: outcome.ok ? outcome.ms : null,
        status: outcome.ok ? outcome.status : null,
        reason: outcome.ok ? null : outcome.reason,
        checkedAt: Date.now(),
    };
    await writeState({ watches: state.watches });
    renderWatches();
}

async function removeWatch(href) {
    state.watches = state.watches.filter((watch) => watch.href !== href);
    await writeState({ watches: state.watches });
    renderWatches();
}

function renderWatches() {
    ui.watchCount.textContent = String(state.watches.length);
    ui.watchCount.hidden = state.watches.length === 0;

    if (state.watches.length === 0) {
        ui.watchList.replaceChildren(element('div', { class: 'history-empty', text: t('watchEmpty') }));
        return;
    }

    ui.watchList.replaceChildren(
        ...state.watches.map((watch) => {
            const tone = watch.state === 'up' ? 'good' : watch.state === 'down' ? 'bad' : 'idle';
            const checked = Number.isFinite(watch.checkedAt)
                ? t('watchChecked', timeFormatter.format(new Date(watch.checkedAt)))
                : t('watchPending');

            return element('div', { class: 'watch-item' },
                icon('i-dot', `icon icon-xs watch-dot watch-dot-${tone}`),
                element('div', { class: 'watch-info' },
                    element('div', { class: 'watch-url', title: watch.href, text: watch.label }),
                    element('div', { class: 'watch-meta', text: `${t('intervalMinutes', watch.minutes)} · ${checked}` })
                ),
                element('span', {
                    class: `watch-state ping-${tone === 'idle' ? 'idle' : tone}`,
                    text: watch.state === 'up'
                        ? t('milliseconds', watch.ms ?? 0)
                        : watch.state === 'down' ? t('errorLabel') : '—',
                }),
                element('button', {
                    class: 'btn-icon',
                    title: t('watchRemove', watch.label),
                    'aria-label': t('watchRemove', watch.label),
                    onClick: () => removeWatch(watch.href),
                }, icon('i-close', 'icon icon-sm'))
            );
        })
    );
}

/* ---------------------------------------------------------------------- *
 * Отрисовка результата и истории
 * ---------------------------------------------------------------------- */

function toneFor(ms) {
    if (!Number.isFinite(ms)) return 'bad';
    if (ms < GOOD_THRESHOLD_MS) return 'good';
    if (ms < MEDIUM_THRESHOLD_MS) return 'medium';
    return 'bad';
}

function renderAll() {
    renderPins();
    renderResult();
    renderStats();
    renderHistory();
    renderWatches();
}

function renderResult() {
    const latest = state.history[0];

    if (!latest) {
        ui.currentResult.replaceChildren(
            element('div', { class: 'result-placeholder' },
                icon('i-globe', 'icon icon-xl'),
                element('p', { text: t('resultPlaceholder') })
            )
        );
        return;
    }

    const chips = [];

    if (latest.ok) {
        // Холодный замер несёт на себе рукопожатие, тёплый — нет. Показываем
        // оба, иначе непонятно, почему повторная проверка «быстрее».
        if (Number.isFinite(latest.warm) && Number.isFinite(latest.cold)) {
            chips.push(makeChip(t('chipCold', latest.cold), 'neutral'));
        }
        if (Number.isFinite(latest.jitter)) {
            chips.push(makeChip(t('chipJitter', latest.jitter), 'neutral'));
        }
        if (latest.degraded) {
            chips.push(makeChip(t('chipHttp', latest.status), 'warn'));
        }
    } else if (latest.reason) {
        chips.push(makeChip(latest.reason === 'timeout' ? t('reasonTimeout') : t('reasonNetwork'), 'warn'));
    }

    const value = latest.ok
        ? element('div', { class: `ping-value ping-${toneFor(latest.ms)}`, text: t('milliseconds', latest.ms) })
        : element('div', { class: 'ping-value ping-error', text: t('errorLabel') });

    ui.currentResult.replaceChildren(
        element('div', { class: 'ping-result fade-in' },
            value,
            element('div', { class: 'ping-url', title: latest.href, text: latest.label }),
            chips.length > 0 ? element('div', { class: 'chips' }, ...chips) : null
        )
    );
}

function makeChip(text, kind) {
    return element('span', { class: `chip chip-${kind}`, text });
}

function renderStats() {
    const latest = state.history[0];

    if (!latest) setStatValue(ui.lastPing, '-', null);
    else if (latest.ok) setStatValue(ui.lastPing, t('milliseconds', latest.ms), toneFor(latest.ms));
    else setStatValue(ui.lastPing, t('errorLabel'), 'bad');

    const successful = state.history.filter((record) => record.ok);
    if (successful.length === 0) {
        setStatValue(ui.avgPing, '-', null);
        return;
    }

    const total = successful.reduce((sum, record) => sum + record.ms, 0);
    const average = Math.round(total / successful.length);
    setStatValue(ui.avgPing, t('milliseconds', average), toneFor(average));
}

function setStatValue(node, text, tone) {
    node.textContent = text;
    node.className = tone ? `stat-value ping-${tone}` : 'stat-value';
}

function renderHistory() {
    if (state.history.length === 0) {
        ui.historyList.replaceChildren(element('div', { class: 'history-empty', text: t('historyEmpty') }));
        return;
    }

    ui.historyList.replaceChildren(
        ...state.history.map((record) => {
            const badge = record.ok
                ? element('span', {
                    class: `history-ping ping-${toneFor(record.ms)}`,
                    text: t('milliseconds', record.ms),
                })
                : element('span', { class: 'history-ping ping-bad', text: t('errorLabel') });

            return element('div', { class: 'history-item' },
                element('span', { class: 'history-url', title: describe(record), text: record.label }),
                element('div', { class: 'history-meta' },
                    record.ok && record.degraded
                        ? element('span', { class: 'history-flag', text: String(record.status) })
                        : null,
                    element('span', {
                        class: 'history-time',
                        text: timeFormatter.format(new Date(record.at)),
                    }),
                    badge
                )
            );
        })
    );
}

/**
 * Полная расшифровка записи — она же подсказка при наведении. Каждое поле
 * проверяется отдельно: записи, сделанные до 1.3, ничего не знают про
 * cold/warm/jitter, и дорисовывать им "undefined" не за чем.
 */
function describe(record) {
    if (!record.ok) {
        if (!record.reason) return record.href;
        return `${record.href}\n${record.reason === 'timeout' ? t('reasonTimeout') : t('reasonNetwork')}`;
    }

    const parts = [];
    if (Number.isFinite(record.status)) parts.push(`HTTP ${record.status}`);
    if (Number.isFinite(record.samples)) parts.push(t('chipSamples', record.samples));
    if (Number.isFinite(record.cold)) parts.push(t('chipCold', record.cold));
    if (Number.isFinite(record.warm)) parts.push(t('chipWarm', record.warm));
    if (Number.isFinite(record.jitter)) parts.push(t('chipJitter', record.jitter));
    if (Number.isFinite(record.min) && Number.isFinite(record.max) && record.min !== record.max) {
        parts.push(t('chipRange', record.min, record.max));
    }

    return parts.length > 0 ? `${record.href}\n${parts.join(' · ')}` : record.href;
}

/* ---------------------------------------------------------------------- *
 * Экспорт и очистка
 * ---------------------------------------------------------------------- */

const CSV_COLUMNS = ['time', 'label', 'url', 'ok', 'ms', 'cold', 'warm', 'jitter', 'min', 'max', 'samples', 'status', 'reason'];

function toCsvCell(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function exportHistory() {
    if (state.history.length === 0) {
        notify(t('toastHistoryEmpty'), 'info');
        return;
    }

    const rows = state.history.map((record) => [
        new Date(record.at).toISOString(),
        record.label,
        record.href,
        record.ok,
        record.ms ?? '',
        record.cold ?? '',
        record.warm ?? '',
        record.jitter ?? '',
        record.min ?? '',
        record.max ?? '',
        record.samples ?? '',
        record.status ?? '',
        record.reason ?? '',
    ]);

    const csv = [CSV_COLUMNS, ...rows].map((row) => row.map(toCsvCell).join(',')).join('\n');

    try {
        await navigator.clipboard.writeText(csv);
        notify(t('toastExported', state.history.length), 'success');
    } catch {
        notify(t('toastExportFailed'), 'error');
    }
}

async function handleClearClick() {
    if (state.history.length === 0) {
        notify(t('toastHistoryEmpty'), 'info');
        return;
    }

    if (!ui.clearBtn.classList.contains('is-armed')) {
        armClearButton();
        notify(t('toastConfirmClear'), 'info');
        return;
    }

    disarmClearButton();
    state.history = [];
    await writeState({ history: state.history });
    renderResult();
    renderStats();
    renderHistory();
    setStatus(t('statusReady'), 'good');
    notify(t('toastHistoryCleared'), 'success');
}

function armClearButton() {
    ui.clearBtn.classList.add('is-armed');
    clearTimeout(clearArmedTimer);
    clearArmedTimer = setTimeout(disarmClearButton, CLEAR_ARMED_MS);
}

function disarmClearButton() {
    clearTimeout(clearArmedTimer);
    clearArmedTimer = null;
    ui.clearBtn.classList.remove('is-armed');
}

/* ---------------------------------------------------------------------- *
 * Состояние интерфейса
 * ---------------------------------------------------------------------- */

function setBusy(busy) {
    isPinging = busy;
    ui.pingBtn.disabled = busy;
    ui.urlInput.disabled = busy;
    ui.currentTabBtn.disabled = busy;
    ui.samplesSelect.disabled = busy;
    for (const button of ui.pinList.querySelectorAll('button')) button.disabled = busy;

    setIcon(ui.pingBtnIcon, busy ? 'i-spinner' : 'i-play');
    ui.pingBtnIcon.classList.toggle('spin', busy);

    if (!busy) {
        ui.pingBtn.classList.add('pulse');
        setTimeout(() => ui.pingBtn.classList.remove('pulse'), 300);
        ui.urlInput.focus();
    }
}

function setStatus(message, tone) {
    ui.statusText.textContent = message;
    setClass(ui.statusIcon, `icon icon-xs status-${tone}`);
    setIcon(ui.statusIcon, tone === 'loading' ? 'i-spinner' : 'i-dot');
    ui.statusIcon.classList.toggle('spin', tone === 'loading');
}

const NOTIFICATION_ICONS = { success: 'i-check', error: 'i-alert', info: 'i-info' };

function notify(message, type) {
    while (ui.notifications.childElementCount >= NOTIFICATION_LIMIT) {
        ui.notifications.firstElementChild.remove();
    }

    const node = element('div', { class: `notification notification-${type}` },
        icon(NOTIFICATION_ICONS[type] ?? NOTIFICATION_ICONS.info, 'icon icon-sm'),
        element('span', { text: message })
    );

    ui.notifications.append(node);

    setTimeout(() => {
        node.classList.add('is-leaving');
        node.addEventListener('animationend', () => node.remove(), { once: true });
        setTimeout(() => node.remove(), 500);
    }, NOTIFICATION_TTL_MS);
}
