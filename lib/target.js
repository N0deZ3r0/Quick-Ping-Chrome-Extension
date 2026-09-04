const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i;
// Октеты уже проверил разбор URL — здесь достаточно отличить IP от домена.
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const LABEL_MAX_LENGTH = 200;

function isDomainName(hostname) {
    if (hostname.length > 253) return false;
    const labels = hostname.split('.');
    if (labels.length < 2) return false;
    if (!labels.every((label) => LABEL_RE.test(label))) return false;
    return TLD_RE.test(labels[labels.length - 1]);
}

/**
 * Приводит ввод к цели проверки; null — если адрес непригоден.
 * Возвращает href для запроса и label для показа.
 */
export function parseTarget(raw) {
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
