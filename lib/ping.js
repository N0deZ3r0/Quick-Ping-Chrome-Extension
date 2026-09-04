/**
 * Измерение отклика.
 *
 * Не ICMP: расширение браузера не умеет слать ICMP-пакеты. Отправляется GET,
 * секундомер останавливается на приходе заголовков, тело сбрасывается не
 * скачиваясь. Получается время до первого байта.
 *
 * Один замер не сопоставим с другим: первый запрос к хосту несёт на себе DNS и
 * TLS-рукопожатие, а повторный переиспользует соединение. Поэтому берём
 * несколько выборок и разделяем их: cold — первая, warm — медиана остальных.
 * Заголовочное число (ms) — warm, если он есть, иначе cold.
 */

export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_SAMPLES = 3;
export const SAMPLE_CHOICES = [1, 3, 5];

export function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[middle]
        : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

async function probe(href, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' };
    } finally {
        clearTimeout(timer);
    }
}

export async function measure(href, options = {}) {
    const samples = Math.max(1, Math.min(9, options.samples ?? DEFAULT_SAMPLES));
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const timings = [];
    let status = null;
    let reason = null;

    for (let attempt = 0; attempt < samples; attempt += 1) {
        const result = await probe(href, timeoutMs);

        if (!result.ok) {
            // Первая выборка провалилась — хост недоступен. Если провалилась
            // поздняя, довольствуемся тем, что успели измерить.
            reason = result.reason;
            break;
        }

        status = result.status;
        timings.push(result.ms);
    }

    if (timings.length === 0) {
        return { ok: false, reason: reason ?? 'network', at: Date.now() };
    }

    const cold = timings[0];
    const warmTimings = timings.slice(1);
    const warm = warmTimings.length > 0 ? median(warmTimings) : null;

    return {
        ok: true,
        ms: warm ?? cold,
        cold,
        warm,
        jitter: warmTimings.length > 1 ? Math.max(...warmTimings) - Math.min(...warmTimings) : null,
        min: Math.min(...timings),
        max: Math.max(...timings),
        samples: timings.length,
        status,
        // Ответ пришёл, но код не 2xx: round-trip состоялся, а сайт отвечает не тем.
        degraded: status !== null && (status < 200 || status >= 300),
        at: Date.now(),
    };
}
