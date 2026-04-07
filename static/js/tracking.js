// ==================== TRACKS ====================
function loadUserTracks(userId, userName, show) {
    const tracksRef = ref(db, 'tracks/' + userId + '/points');
    const tracksQuery = query(tracksRef, limitToLast(30));
    if (!show) {
        if (trackPolylines[userId]) {
            map.removeLayer(trackPolylines[userId]);
            delete trackPolylines[userId];
        }
        if (activeTrackListeners[userId]) {
            off(activeTrackListeners[userId].query, activeTrackListeners[userId].callback);
            delete activeTrackListeners[userId];
        }
        return;
    }
    if (activeTrackListeners[userId]) return;
    
    if (!trackPolylines[userId]) {
        const hue = (userName.split('').reduce((a,b) => a + b.charCodeAt(0), 0) * 31) % 360;
        const color = `hsl(${hue}, 70%, 50%)`;
        trackPolylines[userId] = L.polyline([], { color: color, weight: 3, opacity: 0.7, smoothFactor: 5, noClip: true, renderer: L.canvas() }).addTo(map);
    }
    
    const callback = (snapshot) => {
        const point = snapshot.val();
        if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return;
        if (!isValidVNCoordinate(point.lat, point.lng)) return;
        trackPolylines[userId].addLatLng([point.lat, point.lng]);
        if (trackPolylines[userId].getLatLngs().length > 30) {
            const latlngs = trackPolylines[userId].getLatLngs();
            const simplified = [];
            for (let i = 0; i < latlngs.length; i++) {
                if (i === 0 || i === latlngs.length-1) {
                    simplified.push(latlngs[i]);
                    continue;
                }
                const prev = latlngs[i-1];
                const curr = latlngs[i];
                const next = latlngs[i+1];
                const angle = Math.abs(getBearing(prev.lat, prev.lng, curr.lat, curr.lng) - getBearing(curr.lat, curr.lng, next.lat, next.lng));
                if (angle > 15 && haversine(prev.lat, prev.lng, curr.lat, curr.lng) > 5) {
                    simplified.push(curr);
                }
            }
            trackPolylines[userId].setLatLngs(simplified);
        }
    };
    
    onChildAdded(tracksQuery, callback);
    activeTrackListeners[userId] = { query: tracksQuery, callback: callback };
}

// Hàm khởi tạo track dựa trên showTracks (gọi sau khi allOfficers đã sẵn sàng)
function initTrackingTracks() {
    Object.entries(showTracks).forEach(([uid, show]) => {
        if (show && allOfficers[uid]) {
            loadUserTracks(uid, allOfficers[uid].name, true);
        }
    });
}

// Sẽ gọi sau khi map và allOfficers đã load xong (setTimeout trong map.js)
