'use strict';

/**
 * Quick Ping — измеряет время до первого байта HTTP-ответа.
 *
 * Это не ICMP-пинг: расширение браузера не умеет слать ICMP. Мы делаем один
 * GET и засекаем, сколько прошло до прихода заголовков ответа, после чего
 * сбрасываем тело, не скачивая его. В сумме это DNS + TCP + TLS + ответ
 * сервера — то есть ровно та задержка, которую пользователь и ощущает.
 */

const PING_TIMEOUT_MS = 5000;
const HISTORY_LIMIT = 10;
const GOOD_THRESHOLD_MS = 100;
const MEDIUM_THRESHOLD_MS = 300;
const NOTIFICATION_TTL_MS = 3000;
const NOTIFICATION_LIMIT = 3;
const CLEAR_ARMED_MS = 3500;
const LABEL_MAX_LENGTH = 200;

const SVG_NS = 'http://www.w3.org/2000/svg';

document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const pingBtn = document.getElementById('pingBtn');
    const pingBtnIcon = document.getElementById('pingBtnIcon');
    const clearBtn = document.getElementById('clearBtn');
    const currentResult = document.getElementById('currentResult');
    const lastPing = document.getElementById('lastPing');
    const avgPing = document.getElementById('avgPing');
    const historyList = document.getElementById('historyList');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const notifications = document.getElementById('notifications');
    const quickButtons = Array.from(document.querySelectorAll('.quick-btn'));

    const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

    let pingHistory = [];
    let isPinging = false;
    let clearArmedTimer = null;

    applyTranslations();
    init();

    pingBtn.addEventListener('click', () => startPing(urlInput.value));
    urlInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.isComposing) startPing(urlInput.value);
    });
    clearBtn.addEventListener('click', handleClearClick);
    quickButtons.forEach((button) => {
        button.addEventListener('click', () => {
            urlInput.value = button.dataset.url;
            startPing(button.dataset.url);
        });
    });

    async function init() {
        await loadData();
        renderAll();
        setStatus(t('statusReady'), 'good');
        urlInput.focus();
    }

    /* ------------------------------------------------------------------ *
     * Локализация
     * ------------------------------------------------------------------ */

    function t(key, ...substitutions) {
        return chrome.i18n.getMessage(key, substitutions.map(String)) || key;
    }

    function applyTranslations() {
        document.documentElement.lang = chrome.i18n.getUILanguage();

        const targets = [
            ['data-i18n', 'i18n', null],
            ['data-i18n-title', 'i18nTitle', 'title'],
            ['data-i18n-placeholder', 'i18nPlaceholder', 'placeholder'],
            ['data-i18n-aria', 'i18nAria', 'aria-label'],
        ];

        for (const [selector, datasetKey, attribute] of targets) {
            for (const node of document.querySelectorAll(`[${selector}]`)) {
                const message = t(node.dataset[datasetKey]);
                if (attribute) node.setAttribute(attribute, message);
                else node.textContent = message;
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Разбор адреса
     * ------------------------------------------------------------------ */

    const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i;
    // Октеты уже проверил разбор URL — здесь достаточно отличить IP от домена.
    const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

    function isDomainName(hostname) {
        if (hostname.length > 253) return false;
        const labels = hostname.split('.');
        if (labels.length < 2) return false;
        if (!labels.every((label) => LABEL_RE.test(label))) return false;
        return TLD_RE.test(labels[labels.length - 1]);
    }

    /** Приводит ввод к цели проверки; null — если адрес непригоден. */
    function parseTarget(raw) {
        const input = String(raw ?? '').trim();
        if (!input || /\s/.test(input)) return null;

        const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;

        let url;
        try {
            url = new URL(candidate);
        } catch {
            return null;
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

        const hostname = url.hostname;
        const isIpv6 = hostname.startsWith('[') && hostname.endsWith(']');
        const isIpv4 = IPV4_RE.test(hostname);
        if (!isIpv6 && !isIpv4 && hostname !== 'localhost' && !isDomainName(hostname)) return null;

        url.hash = '';
        url.username = '';
        url.password = '';

        const path = url.pathname === '/' ? '' : url.pathname;
        const label = `${url.host}${path}${url.search}`.slice(0, LABEL_MAX_LENGTH);

        return { href: url.href, label };
    }

    /* ------------------------------------------------------------------ *
     * Измерение
     * ------------------------------------------------------------------ */

    async function measure(href) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
        const startedAt = performance.now();

        try {
            const response = await fetch(href, {
                method: 'GET',
                cache: 'no-store',
                redirect: 'follow',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                signal: controller.signal,
            });

            const ms = Math.round(performance.now() - startedAt);

            // Заголовки получены — тело не нужно, освобождаем соединение.
            response.body?.cancel().catch(() => {});

            return { ok: true, ms, status: response.status };
        } catch {
            return { ok: false, timedOut: controller.signal.aborted };
        } finally {
            clearTimeout(timer);
        }
    }

    async function startPing(rawUrl) {
        if (isPinging) {
            notify(t('toastBusy'), 'info');
            return;
        }

        const target = parseTarget(rawUrl);
        if (!target) {
            notify(t('toastInvalidUrl'), 'error');
            urlInput.focus();
            urlInput.select();
            return;
        }

        setBusy(true);
        setStatus(t('statusChecking'), 'loading');

        try {
            const outcome = await measure(target.href);

            addRecord({
                label: target.label,
                href: target.href,
                ms: outcome.ok ? outcome.ms : null,
                status: outcome.ok ? outcome.status : null,
                ok: outcome.ok,
                at: Date.now(),
            });
            renderAll();

            if (outcome.ok) {
                notify(t('toastResult', outcome.ms), 'success');
                setStatus(t('milliseconds', outcome.ms), toneFor(outcome.ms));
            } else {
                const seconds = Math.round(PING_TIMEOUT_MS / 1000);
                notify(outcome.timedOut ? t('toastTimeout', seconds) : t('toastUnreachable'), 'error');
                setStatus(t('statusError'), 'bad');
            }
        } finally {
            setBusy(false);
        }
    }

    /* ------------------------------------------------------------------ *
     * Состояние
     * ------------------------------------------------------------------ */

    function toneFor(ms) {
        if (!Number.isFinite(ms)) return 'bad';
        if (ms < GOOD_THRESHOLD_MS) return 'good';
        if (ms < MEDIUM_THRESHOLD_MS) return 'medium';
        return 'bad';
    }

    function addRecord(record) {
        pingHistory.unshift(record);
        pingHistory = pingHistory.slice(0, HISTORY_LIMIT);
        saveData();
    }

    function isValidRecord(value) {
        return Boolean(
            value &&
            typeof value === 'object' &&
            typeof value.label === 'string' &&
            typeof value.href === 'string' &&
            typeof value.ok === 'boolean' &&
            Number.isFinite(value.at) &&
            (value.ms === null || Number.isFinite(value.ms)) &&
            (value.status === null || Number.isFinite(value.status))
        );
    }

    async function loadData() {
        try {
            const stored = await chrome.storage.local.get({ pingHistory: [] });
            pingHistory = Array.isArray(stored.pingHistory)
                ? stored.pingHistory.filter(isValidRecord).slice(0, HISTORY_LIMIT)
                : [];
        } catch (error) {
            console.warn('Quick Ping: не удалось прочитать историю', error);
            pingHistory = [];
        }
    }

    function saveData() {
        chrome.storage.local.set({ pingHistory }).catch((error) => {
            console.warn('Quick Ping: не удалось сохранить историю', error);
        });
    }

    /* ------------------------------------------------------------------ *
     * Отрисовка
     * ------------------------------------------------------------------ */

    function renderAll() {
        renderCurrentResult();
        renderStats();
        renderHistory();
    }

    function renderCurrentResult() {
        currentResult.replaceChildren();

        const latest = pingHistory[0];
        if (!latest) {
            currentResult.append(
                element('div', { class: 'result-placeholder' },
                    icon('i-globe', 'icon icon-xl'),
                    element('p', { text: t('resultPlaceholder') })
                )
            );
            return;
        }

        const value = latest.ok
            ? element('div', { class: `ping-value ping-${toneFor(latest.ms)}`, text: t('milliseconds', latest.ms) })
            : element('div', { class: 'ping-value ping-error', text: t('errorLabel') });

        currentResult.append(
            element('div', { class: 'ping-result fade-in' },
                value,
                element('div', { class: 'ping-url', title: latest.href, text: latest.label })
            )
        );
    }

    function renderStats() {
        const latest = pingHistory[0];
        if (!latest) {
            setStatValue(lastPing, '-', null);
        } else if (latest.ok) {
            setStatValue(lastPing, t('milliseconds', latest.ms), toneFor(latest.ms));
        } else {
            setStatValue(lastPing, t('errorLabel'), 'bad');
        }

        const successful = pingHistory.filter((record) => record.ok);
        if (successful.length === 0) {
            setStatValue(avgPing, '-', null);
            return;
        }

        const total = successful.reduce((sum, record) => sum + record.ms, 0);
        const average = Math.round(total / successful.length);
        setStatValue(avgPing, t('milliseconds', average), toneFor(average));
    }

    function setStatValue(node, text, tone) {
        node.textContent = text;
        node.className = tone ? `stat-value ping-${tone}` : 'stat-value';
    }

    function renderHistory() {
        historyList.replaceChildren();

        if (pingHistory.length === 0) {
            historyList.append(element('div', { class: 'history-empty', text: t('historyEmpty') }));
            return;
        }

        for (const record of pingHistory) {
            const badge = record.ok
                ? element('span', {
                    class: `history-ping ping-${toneFor(record.ms)}`,
                    text: t('milliseconds', record.ms),
                })
                : element('span', { class: 'history-ping ping-bad', text: t('errorLabel') });

            const title = record.ok
                ? t('historyEntryTitle', record.href, record.status)
                : record.href;

            historyList.append(
                element('div', { class: 'history-item' },
                    element('span', { class: 'history-url', title, text: record.label }),
                    element('div', { class: 'history-meta' },
                        element('span', {
                            class: 'history-time',
                            text: timeFormatter.format(new Date(record.at)),
                        }),
                        badge
                    )
                )
            );
        }
    }

    /* ------------------------------------------------------------------ *
     * Очистка истории — без confirm(), который умеет закрывать попап
     * ------------------------------------------------------------------ */

    function handleClearClick() {
        if (pingHistory.length === 0) {
            notify(t('toastHistoryEmpty'), 'info');
            return;
        }

        if (!clearBtn.classList.contains('is-armed')) {
            armClearButton();
            notify(t('toastConfirmClear'), 'info');
            return;
        }

        disarmClearButton();
        pingHistory = [];
        saveData();
        renderAll();
        setStatus(t('statusReady'), 'good');
        notify(t('toastHistoryCleared'), 'success');
    }

    function armClearButton() {
        clearBtn.classList.add('is-armed');
        clearTimeout(clearArmedTimer);
        clearArmedTimer = setTimeout(disarmClearButton, CLEAR_ARMED_MS);
    }

    function disarmClearButton() {
        clearTimeout(clearArmedTimer);
        clearArmedTimer = null;
        clearBtn.classList.remove('is-armed');
    }

    /* ------------------------------------------------------------------ *
     * UI
     * ------------------------------------------------------------------ */

    function setBusy(busy) {
        isPinging = busy;
        pingBtn.disabled = busy;
        urlInput.disabled = busy;
        quickButtons.forEach((button) => { button.disabled = busy; });

        setIcon(pingBtnIcon, busy ? 'i-spinner' : 'i-play');
        pingBtnIcon.classList.toggle('spin', busy);

        if (!busy) {
            pingBtn.classList.add('pulse');
            setTimeout(() => pingBtn.classList.remove('pulse'), 300);
            urlInput.focus();
        }
    }

    function setStatus(message, tone) {
        statusText.textContent = message;
        // У SVGElement className доступен только на чтение — только setAttribute.
        statusIcon.setAttribute('class', `icon icon-xs status-${tone}`);
        setIcon(statusIcon, tone === 'loading' ? 'i-spinner' : 'i-dot');
        statusIcon.classList.toggle('spin', tone === 'loading');
    }

    const NOTIFICATION_ICONS = { success: 'i-check', error: 'i-alert', info: 'i-info' };

    function notify(message, type) {
        while (notifications.childElementCount >= NOTIFICATION_LIMIT) {
            notifications.firstElementChild.remove();
        }

        const node = element('div', { class: `notification notification-${type}` },
            icon(NOTIFICATION_ICONS[type] ?? NOTIFICATION_ICONS.info, 'icon icon-sm'),
            element('span', { text: message })
        );

        notifications.append(node);

        setTimeout(() => {
            node.classList.add('is-leaving');
            node.addEventListener('animationend', () => node.remove(), { once: true });
            setTimeout(() => node.remove(), 500);
        }, NOTIFICATION_TTL_MS);
    }

    /* ------------------------------------------------------------------ *
     * Помощники DOM. Никакого innerHTML: сюда приходит пользовательский
     * ввод, и склейка разметки строкой уже давала XSS через title="...".
     * ------------------------------------------------------------------ */

    function element(tag, attributes = {}, ...children) {
        const node = document.createElement(tag);

        for (const [name, value] of Object.entries(attributes)) {
            if (value === undefined || value === null) continue;
            if (name === 'text') node.textContent = value;
            else if (name === 'class') node.className = value;
            else node.setAttribute(name, value);
        }

        node.append(...children.filter(Boolean));
        return node;
    }

    function icon(name, className = 'icon') {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', className);
        const use = document.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', `#${name}`);
        svg.append(use);
        return svg;
    }

    function setIcon(svg, name) {
        svg.querySelector('use')?.setAttribute('href', `#${name}`);
    }
});
