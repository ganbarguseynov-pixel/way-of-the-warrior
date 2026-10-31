// --- ТЕСТ ТРЯСКИ С КНОПКОЙ СТОП ---
let isShakeTesting = false;
let maxShakeValue = 0;

async function startShakeTest() {
    if (isShakeTesting) return;

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') {
                tg.showAlert("Ты не дал доступ к датчикам. Тест невозможен.");
                return;
            }
        } catch (e) {
            tg.showAlert("Ошибка запроса: " + e.message);
            return;
        }
    }

    isShakeTesting = true;
    maxShakeValue = 0;

    document.getElementById('test-shake-btn').style.display = 'none';
    document.getElementById('stop-shake-btn').style.display = 'block';

    window.addEventListener('devicemotion', function(event) {
        if (!isShakeTesting) return;
        const acc = event.accelerationIncludingGravity;
        if (acc) {
            const force = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
            const shakeValue = Math.round(force);
            if (shakeValue > maxShakeValue) maxShakeValue = shakeValue;
        }
    });

    tg.showAlert("Тряси телефон! Когда закончишь — нажми СТОП.");
}

function stopShakeTest() {
    isShakeTesting = false;
    document.getElementById('test-shake-btn').style.display = 'block';
    document.getElementById('stop-shake-btn').style.display = 'none';
    tg.showAlert("Максимальная тряска: " + maxShakeValue);
}
