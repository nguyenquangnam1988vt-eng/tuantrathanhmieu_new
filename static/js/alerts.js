// Xử lý báo động
const alertsRef = ref(db, 'alerts');
const oneDayAgo = Date.now() - 24*60*60*1000;
const playedAlerts = new Set(JSON.parse(sessionStorage.getItem("playedAlerts") || "[]"));
function savePlayedAlerts() { sessionStorage.setItem("playedAlerts", JSON.stringify([...playedAlerts])); }

function getAlertPopupContent(alert) {
    if (!alert || !alert.name) return "Báo động không hợp lệ";
    let distanceText = "";
    const myPos = allOfficers[myUsername];
    if (myPos && isValidVNCoordinate(myPos.lat, myPos.lng)) {
        const distance = haversine(myPos.lat, myPos.lng, alert.lat, alert.lng);
        distanceText = `<br>Khoảng cách: ${(distance/1000).toFixed(2)} km`;
    }
    let statusText = "";
    if (alert.status === "pending") statusText = "🟥 Chưa xử lý";
    else if (alert.status === "accepted") statusText = `🟨 Đang xử lý bởi ${alert.accepted_by || ""}`;
    else if (alert.status === "resolved") statusText = "🟩 Đã xong";
    else if (alert.status === "expired") statusText = "⏰ Hết hạn";
    else statusText = "Không rõ";
    return `🚨 <b>Báo động từ ${alert.name}</b><br> Trạng thái: ${statusText} ${distanceText}<br> ${new Date(alert.timestamp).toLocaleString()}`;
}

const alertIcon = L.divIcon({ className: '', html: '<div class="alert-marker"></div>', iconSize: [24, 24], popupAnchor: [0, -12] });

onChildAdded(alertsRef, (data) => {
    const alert = data.val();
    const id = data.key;
    if (!alert || !alert.timestamp || alert.timestamp < oneDayAgo) return;
    if (!isValidVNCoordinate(alert.lat, alert.lng)) return;
    if (!alertMarkers[id]) {
        const marker = L.marker([alert.lat, alert.lng], { icon: alertIcon })
            .addTo(map)
            .bindPopup(getAlertPopupContent(alert));
        alertMarkers[id] = marker;
    }
    const now = Date.now();
    const isMyAlert = (alert.created_by === myUsername);
    const isRecent = (now - alert.timestamp) < 15000;
    if (!isMyAlert && isRecent && !playedAlerts.has(id)) {
        playedAlerts.add(id);
        savePlayedAlerts();
        if (audioActivated && alertSound) {
            alertSound.currentTime = 0;
            alertSound.play().catch(() => {});
        }
        // Chỉ flyTo nếu người dùng không đang tương tác
        if (!map._animatingZoom && !userDragging) {
            map.flyTo([alert.lat, alert.lng], 17, { animate: true, duration: 1.5 });
        }
        setTimeout(() => {
            if (alertSound && !alertSound.paused) { alertSound.pause(); alertSound.currentTime = 0; }
        }, 15000);
        alertTimeouts[id] = setTimeout(() => {
            get(ref(db, 'alerts/' + id)).then((snapshot) => {
                const currentAlert = snapshot.val();
                if (currentAlert && currentAlert.status === 'pending') {
                    removeAlertMarker(id);
                    update(ref(db, 'alerts/' + id), { status: 'expired' });
                }
            });
        }, 20000);
    }
});

onChildChanged(alertsRef, (data) => {
    const alert = data.val();
    const id = data.key;
    if (!alert) return;
    if (alertMarkers[id]) {
        alertMarkers[id].setPopupContent(getAlertPopupContent(alert));
        if (["accepted", "resolved", "expired"].includes(alert.status)) removeAlertMarker(id);
    }
});
onChildRemoved(alertsRef, (data) => { const id = data.key; removeAlertMarker(id); });