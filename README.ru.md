<div align="center">

<img src="icons/icon128.png" width="88" alt="Quick Ping">

# Quick Ping ⚡

**Проверка отклика любого сайта прямо из панели Chrome. Вводите адрес — получаете миллисекунды.**

[![CI](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/actions/workflows/ci.yml/badge.svg)](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/actions/workflows/ci.yml)
[![Релиз](https://img.shields.io/github/v/release/N0deZ3r0/Quick-Ping-Chrome-Extension?label=%D1%80%D0%B5%D0%BB%D0%B8%D0%B7)](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/releases/latest)
[![Лицензия](https://img.shields.io/github/license/N0deZ3r0/Quick-Ping-Chrome-Extension?color=blue&label=%D0%BB%D0%B8%D1%86%D0%B5%D0%BD%D0%B7%D0%B8%D1%8F)](LICENSE)
![Manifest V3](https://img.shields.io/badge/manifest-v3-4285F4?logo=googlechrome&logoColor=white)

[English](README.md) · **Русский**

</div>

---

## Что это

Простое расширение для быстрой проверки скорости отклика любого сайта. Ввели
адрес — получили пинг в миллисекундах. Без регистрации, без настройки, без
телеметрии.

| | |
|---|---|
| **Быстро** | Результат за 2–3 секунды |
| **Просто** | Минимум кнопок, максимум пользы |
| **Наглядно** | Цветовая индикация качества пинга |
| **Честно** | Для недоступных сайтов показывает `ERROR`, а не выдуманное число |
| **Практично** | Сохраняет историю проверок |

## Установка

Расширения нет в Chrome Web Store — ставится распакованным.

1. **Скачайте файлы.** Откройте [Releases](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/releases/latest),
   скачайте архив и распакуйте в любую папку.
2. **Откройте страницу расширений.** Перейдите на `chrome://extensions/` и
   включите **режим разработчика** в правом верхнем углу.
3. **Загрузите.** Нажмите **Загрузить распакованное расширение** и выберите
   распакованную папку.
4. **Закрепите.** Нажмите на «булавку» 📌 рядом с Quick Ping, чтобы значок
   остался в панели.

Готово — в Chrome появился значок ⚡.

### Chrome ругается на расширение

Это нормально для любого распакованного расширения. Нажмите **Подробнее** под
предупреждением, затем **Всё равно установить**. Дальше расширение работает как
обычно.

### Какие файлы нужны

```text
manifest.json    обязательно
popup.html       обязательно
popup.css        обязательно
popup.js         обязательно
icons/           папка с иконками
```

## Обновление своей сборки

1. Замените файлы в папке.
2. Нажмите **Обновить** на карточке расширения в `chrome://extensions/`.
3. Изменения применятся сразу.

## Разрешения

| Разрешение | Зачем оно нужно |
|---|---|
| `activeTab` | Прочитать адрес текущей вкладки, чтобы его пропинговать |
| `storage` | Хранить историю проверок локально |

Никуда ничего не отправляется. История лежит в браузере и его не покидает.

## Участие в разработке

Баг-репорты и пул-реквесты приветствуются — см. [CONTRIBUTING.md](CONTRIBUTING.md).
Нашли уязвимость?
[Сообщите приватно](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/security/advisories/new),
а не публичной задачей.

## Лицензия

[MIT](LICENSE) — свободное использование, в том числе коммерческое.
