const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Собирает узел без innerHTML. Через эти функции проходит пользовательский
 * ввод, а склейка разметки строкой в этом проекте уже приводила к XSS.
 */
export function element(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);

    for (const [name, value] of Object.entries(attributes)) {
        if (value === undefined || value === null || value === false) continue;
        if (name === 'text') node.textContent = value;
        else if (name === 'class') node.className = value;
        else if (name === 'onClick') node.addEventListener('click', value);
        else if (value === true) node.setAttribute(name, '');
        else node.setAttribute(name, value);
    }

    node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
    return node;
}

export function icon(name, className = 'icon') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className);
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${name}`);
    svg.append(use);
    return svg;
}

export function setIcon(svg, name) {
    svg.querySelector('use')?.setAttribute('href', `#${name}`);
}

/** У SVGElement className доступен только на чтение — нужен setAttribute. */
export function setClass(node, className) {
    node.setAttribute('class', className);
}
