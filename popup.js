document.addEventListener('DOMContentLoaded', function() {
    // Элементы
    const urlInput = document.getElementById('urlInput');
    const pingBtn = document.getElementById('pingBtn');
    const clearBtn = document.getElementById('clearBtn');
    const currentResult = document.getElementById('currentResult');
    const lastPing = document.getElementById('lastPing');
    const avgPing = document.getElementById('avgPing');
    const historyList = document.getElementById('historyList');
    const status = document.getElementById('status');
    const quickButtons = document.querySelectorAll('.quick-btn');

    // Данные
    let pingHistory = [];

    // Инициализация
    loadData();
    urlInput.focus();

    // События
    pingBtn.addEventListener('click', () => pingSite(urlInput.value));
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') pingSite(urlInput.value);
    });
    
    clearBtn.addEventListener('click', clearHistory);
    
    // Быстрые кнопки
    quickButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            urlInput.value = btn.dataset.url;
            pingSite(btn.dataset.url);
        });
    });

    // Основная функция проверки пинга
    async function pingSite(url) {
        if (!url || !isValidUrl(url)) {
            showMessage('Введите корректный адрес сайта', 'error');
            return;
        }

        // Нормализация URL
        const cleanUrl = cleanUrlInput(url);
        const fullUrl = `https://${cleanUrl}`;

        // Обновление UI
        updateButton(true);
        updateStatus('Проверка...', 'loading');

        try {
            // Проверка доступности
            const isAccessible = await checkAccessibility(fullUrl);
            if (!isAccessible) {
                // Показываем ошибку в основном окне
                showErrorResult(cleanUrl);
                showMessage('Сайт не отвечает', 'error');
                updateStatus('Ошибка', 'bad');
                updateButton(false);
                return;
            }

            // Измерение пинга
            const ping = await measurePing(fullUrl);
            
            if (ping > 0) {
                // Сохранение результата
                const result = {
                    url: cleanUrl,
                    ping: ping,
                    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    fullUrl: fullUrl,
                    error: false
                };
                
                saveResult(result);
                updateCurrentResult(result);
                updateStats();
                showMessage(`Пинг: ${ping} мс`, 'success');
                updateStatus(`${ping} мс`, getPingStatus(ping));
            } else {
                showErrorResult(cleanUrl);
                showMessage('Ошибка измерения', 'error');
                updateStatus('Ошибка', 'bad');
            }

        } catch (error) {
            console.error('Ошибка:', error);
            showErrorResult(cleanUrl);
            showMessage('Ошибка проверки', 'error');
            updateStatus('Ошибка', 'bad');
        } finally {
            updateButton(false);
        }
    }

    // Функция для показа ошибки в основном окне
    function showErrorResult(url) {
        const result = {
            url: url,
            ping: 'error',
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            error: true
        };
        
        saveResult(result);
        updateCurrentResult(result);
        updateStats();
    }

    // Проверка доступности сайта
    async function checkAccessibility(url) {
        return new Promise((resolve) => {
            fetch(url, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store'
            })
            .then(() => resolve(true))
            .catch(() => {
                // Если CORS ошибка, все равно пробуем
                const img = new Image();
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                img.src = url + '?t=' + Date.now();
                setTimeout(() => resolve(false), 2000);
            });
        });
    }

    // Измерение пинга
    async function measurePing(url) {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const img = new Image();
            
            img.onload = img.onerror = () => {
                const endTime = performance.now();
                const ping = Math.round(endTime - startTime);
                resolve(ping > 10 ? ping : 50); // Минимум 50мс
            };
            
            setTimeout(() => resolve(0), 3000);
            img.src = url + '/favicon.ico?t=' + Date.now();
        });
    }

    // Вспомогательные функции
    function isValidUrl(url) {
        return url && url.includes('.') && url.length > 3 && !url.includes(' ');
    }

    function cleanUrlInput(url) {
        return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }

    function getPingStatus(ping) {
        if (ping === 'error') return 'bad';
        if (ping < 100) return 'good';
        if (ping < 300) return 'medium';
        return 'bad';
    }

    // Работа с результатами
    function saveResult(result) {
        pingHistory.unshift(result);
        if (pingHistory.length > 10) {
            pingHistory = pingHistory.slice(0, 10);
        }
        saveData();
        updateHistoryList();
        updateStats();
    }

    function updateCurrentResult(result) {
        if (result.error || result.ping === 'error') {
            // Показываем ошибку
            currentResult.innerHTML = `
                <div class="ping-result fade-in">
                    <div class="ping-value ping-error">ERROR</div>
                    <div class="ping-url">${result.url}</div>
                </div>
            `;
        } else {
            // Показываем нормальный пинг
            const pingClass = getPingStatus(result.ping);
            currentResult.innerHTML = `
                <div class="ping-result fade-in">
                    <div class="ping-value ${pingClass}">${result.ping} мс</div>
                    <div class="ping-url">${result.url}</div>
                </div>
            `;
        }
    }

    function updateStats() {
        if (pingHistory.length > 0) {
            const last = pingHistory[0];
            
            // Обновляем последний пинг
            if (last.error || last.ping === 'error') {
                lastPing.textContent = 'ERROR';
                lastPing.className = 'stat-value ping-bad';
            } else {
                lastPing.textContent = `${last.ping} мс`;
                lastPing.className = `stat-value ${getPingStatus(last.ping)}`;
            }
            
            // Обновляем средний пинг (только для успешных проверок)
            const successfulPings = pingHistory.filter(r => !r.error && r.ping !== 'error');
            if (successfulPings.length > 0) {
                const avg = Math.round(successfulPings.reduce((sum, r) => sum + r.ping, 0) / successfulPings.length);
                avgPing.textContent = `${avg} мс`;
                avgPing.className = `stat-value ${getPingStatus(avg)}`;
            } else {
                avgPing.textContent = '-';
            }
        } else {
            lastPing.textContent = '-';
            avgPing.textContent = '-';
        }
    }

    function updateHistoryList() {
        if (pingHistory.length === 0) {
            historyList.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8">Нет истории</div>';
            return;
        }

        historyList.innerHTML = pingHistory.map(item => {
            if (item.error || item.ping === 'error') {
                return `
                    <div class="history-item">
                        <span class="history-url" title="${item.url}">${item.url}</span>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="history-time">${item.time}</span>
                            <span class="history-ping ping-bad">ERROR</span>
                        </div>
                    </div>
                `;
            } else {
                const pingClass = getPingStatus(item.ping);
                return `
                    <div class="history-item">
                        <span class="history-url" title="${item.url}">${item.url}</span>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="history-time">${item.time}</span>
                            <span class="history-ping ${pingClass}">${item.ping} мс</span>
                        </div>
                    </div>
                `;
            }
        }).join('');
    }

    function clearHistory() {
        if (pingHistory.length === 0) {
            showMessage('История пуста', 'info');
            return;
        }

        if (confirm('Очистить историю проверок?')) {
            pingHistory = [];
            saveData();
            updateStats();
            updateHistoryList();
            currentResult.innerHTML = `
                <div class="result-placeholder">
                    <i class="fas fa-satellite-dish"></i>
                    <p>Введите адрес сайта</p>
                </div>
            `;
            updateStatus('Готов', 'good');
            showMessage('История очищена', 'success');
        }
    }

    // UI функции
    function updateButton(isLoading) {
        pingBtn.disabled = isLoading;
        pingBtn.innerHTML = isLoading ? 
            '<i class="fas fa-spinner fa-spin"></i>' : 
            '<i class="fas fa-play"></i>';
        
        if (!isLoading) {
            pingBtn.classList.add('pulse');
            setTimeout(() => pingBtn.classList.remove('pulse'), 300);
        }
    }

    function updateStatus(message, type) {
        const icon = status.querySelector('i');
        const text = status.querySelector('span');
        
        text.textContent = message;
        status.className = 'status';
        
        if (type === 'good') {
            status.classList.add('status-good');
            icon.className = 'fas fa-circle';
        } else if (type === 'medium') {
            status.classList.add('status-medium');
            icon.className = 'fas fa-circle';
        } else if (type === 'bad') {
            status.classList.add('status-bad');
            icon.className = 'fas fa-circle';
        } else if (type === 'loading') {
            status.classList.add('status-loading');
            icon.className = 'fas fa-circle-notch fa-spin';
        }
    }

    function showMessage(message, type) {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = 'notification';
        
        // Выбираем цвет в зависимости от типа
        if (type === 'success') {
            notification.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else if (type === 'error') {
            notification.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        } else {
            notification.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
        }
        
        // Иконка
        const icon = type === 'success' ? 'fa-check-circle' : 
                     type === 'error' ? 'fa-exclamation-circle' : 
                     'fa-info-circle';
        
        notification.innerHTML = `
            <i class="fas ${icon}"></i>
            <span>${message}</span>
        `;
        
        // Добавляем на страницу
        document.body.appendChild(notification);
        
        // Удаляем через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    // Работа с хранилищем
    function saveData() {
        chrome.storage.local.set({
            pingHistory: pingHistory
        });
    }

    function loadData() {
        chrome.storage.local.get(['pingHistory'], (data) => {
            if (data.pingHistory) {
                pingHistory = data.pingHistory;
                updateStats();
                updateHistoryList();
            }
            updateStatus('Готов', 'good');
        });
    }
});