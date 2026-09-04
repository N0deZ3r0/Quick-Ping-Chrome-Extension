export function t(key, ...substitutions) {
    return chrome.i18n.getMessage(key, substitutions.map(String)) || key;
}

const TARGETS = [
    ['data-i18n', 'i18n', null],
    ['data-i18n-title', 'i18nTitle', 'title'],
    ['data-i18n-placeholder', 'i18nPlaceholder', 'placeholder'],
    ['data-i18n-aria', 'i18nAria', 'aria-label'],
];

export function applyTranslations(root = document) {
    if (root === document) document.documentElement.lang = chrome.i18n.getUILanguage();

    for (const [selector, datasetKey, attribute] of TARGETS) {
        for (const node of root.querySelectorAll(`[${selector}]`)) {
            const message = t(node.dataset[datasetKey]);
            if (attribute) node.setAttribute(attribute, message);
            else node.textContent = message;
        }
    }
}
