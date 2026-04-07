// static/js/wakeLock.js
let wakeLock = null;
let isWakeLockRequested = false;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
        console.warn('⚠️ Trình duyệt không hỗ trợ Screen Wake Lock API');
        return;
    }
    if (isWakeLockRequested) return;
    isWakeLockRequested = true;

    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('✅ Wake Lock active - màn hình sẽ không tắt');
        wakeLock.addEventListener('release', () => {
            console.log('⚠️ Wake Lock released');
            isWakeLockRequested = false;
            wakeLock = null;
        });
    } catch (err) {
        console.error(`❌ Wake Lock error: ${err.name}, ${err.message}`);
        isWakeLockRequested = false;
    }
}

const requestWakeLockOnFirstInteraction = () => {
    requestWakeLock();
    document.body.removeEventListener('click', requestWakeLockOnFirstInteraction);
    document.body.removeEventListener('touchstart', requestWakeLockOnFirstInteraction);
};

document.body.addEventListener('click', requestWakeLockOnFirstInteraction);
document.body.addEventListener('touchstart', requestWakeLockOnFirstInteraction);

document.addEventListener('visibilitychange', async () => {
    if (wakeLock === null && document.visibilityState === 'visible' && isWakeLockRequested === false) {
        requestWakeLock();
    }
});
