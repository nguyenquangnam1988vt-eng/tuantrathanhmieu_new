// ==================== MARKERS (điểm đánh dấu) ====================
const markersRootRef = ref(db, 'markers');
onChildAdded(markersRootRef, (userSnapshot) => {
    const userId = userSnapshot.key;
    const userMarkersRef = ref(db, `markers/${userId}`);
    onChildAdded(userMarkersRef, (markerSnapshot) => {
        const point = markerSnapshot.val();
        if (!point || !point.timestamp) return;
        const markerId = markerSnapshot.key;
        const fullId = `${userId}_${markerId}`;
        const age = Date.now() - point.timestamp;
        if (age > 24*60*60*1000) { remove(ref(db, `markers/${userId}/${markerId}`)); return; }
        if (isValidVNCoordinate(point.lat, point.lng)) {
            const marker = L.circleMarker([point.lat, point.lng], {
                radius: 6, color: '#ffaa00', fillColor: '#ffaa00', fillOpacity: 0.8, weight: 1,
                renderer: L.canvas()
            }).addTo(map);
            let popupContent = `<b>${point.created_by || 'Unknown'}</b><br>${point.note || ''}<br>${new Date(point.timestamp).toLocaleString()}`;
            const canDelete = (point.created_by === myName) || (userRole === 'commander') || (userRole === 'admin');
            if (canDelete) {
                popupContent += `<br><button class="delete-btn" data-fullid="${fullId}" data-userid="${userId}" data-markerid="${markerId}">🗑️ Xoá điểm</button>`;
            }
            marker.bindPopup(popupContent);
            pointMarkers[fullId] = marker;
        }
    });
    onChildRemoved(userMarkersRef, (markerSnapshot) => {
        const markerId = markerSnapshot.key;
        const fullId = `${userId}_${markerId}`;
        if (pointMarkers[fullId]) {
            map.removeLayer(pointMarkers[fullId]);
            delete pointMarkers[fullId];
        }
    });
});

// ==================== INCIDENTS (ảnh hiện trường) ====================
const incidentsRef = ref(db, 'incidents');
const incidentIcon = L.divIcon({ className: '', html: '<div class="incident-icon">📷</div>', iconSize: [30, 30], popupAnchor: [0, -15] });
onChildAdded(incidentsRef, (data) => {
    const inc = data.val();
    const id = data.key;
    if (!inc || !inc.timestamp) return;
    const age = Date.now() - inc.timestamp;
    if (age > 24*60*60*1000) { remove(ref(db, 'incidents/' + id)); return; }
    if (isValidVNCoordinate(inc.lat, inc.lng)) {
        const marker = L.marker([inc.lat, inc.lng], { icon: incidentIcon }).addTo(map)
            .bindPopup(`<b>${inc.created_by || 'Unknown'}</b><br> ${inc.note || ''}<br> <img src="${inc.image_url}" style="max-width:200px; max-height:200px;"><br> ${new Date(inc.timestamp).toLocaleString()}`);
        incidentMarkers[id] = marker;
    }
});
onChildRemoved(incidentsRef, (data) => { const id = data.key; if (incidentMarkers[id]) { map.removeLayer(incidentMarkers[id]); delete incidentMarkers[id]; } });

// ==================== MOVE ORDERS ====================
const moveOrdersRef = ref(db, 'move_orders');
onChildAdded(moveOrdersRef, (snapshot) => {
    const order = snapshot.val();
    const orderId = snapshot.key;
    if (!order || order.status !== 'active') return;
    if (!isValidVNCoordinate(order.toLat, order.toLng)) return;
    const latlngs = [[order.fromLat, order.fromLng], [order.toLat, order.toLng]];
    const polyline = L.polyline(latlngs, {
        color: '#ff8800', weight: 4, opacity: 0.8, dashArray: '5, 10',
        renderer: L.canvas()
    }).addTo(map);
    if (polyline.arrowheads) polyline.arrowheads({ size: '12px', frequency: 'all', color: '#ff8800' });
    const officerName = allOfficers[order.officerId]?.name || order.officerId;
    let popupContent = `📍 Lệnh di chuyển<br>Từ: ${order.commanderName}<br>Đến: ${officerName}<br>Điểm đến: ${order.toLat.toFixed(6)}, ${order.toLng.toFixed(6)}<br>Ghi chú: ${order.note || 'không'}`;
    const canCancel = (order.commanderId === myUsername) || (userRole === 'commander') || (userRole === 'admin');
    if (canCancel) {
        popupContent += `<br><button class="delete-btn" data-orderid="${orderId}">❌ Huỷ lệnh</button>`;
    }
    polyline.bindPopup(popupContent);
    moveOrderLines[orderId] = polyline;
    if (order.officerId === myUsername) {
        L.popup().setLatLng([order.toLat, order.toLng]).setContent(`🚶 Bạn được lệnh di chuyển đến đây từ ${order.commanderName}<br>Ghi chú: ${order.note || 'không'}`).openOn(map);
    }
});
onChildRemoved(moveOrdersRef, (snapshot) => {
    const orderId = snapshot.key;
    if (moveOrderLines[orderId]) {
        map.removeLayer(moveOrderLines[orderId]);
        delete moveOrderLines[orderId];
    }
});
function checkOrdersCompletion() {
    get(moveOrdersRef).then((snapshot) => {
        const orders = snapshot.val() || {};
        for (const [orderId, order] of Object.entries(orders)) {
            if (order.status !== 'active') continue;
            const officerPos = allOfficers[order.officerId];
            if (!officerPos) continue;
            const dist = haversine(officerPos.lat, officerPos.lng, order.toLat, order.toLng);
            if (dist < 20) {
                remove(ref(db, 'move_orders/' + orderId));
            }
        }
    }).catch(console.error);
}
setInterval(checkOrdersCompletion, 5000);

function zoomToAllOfficers() {
    const officersList = Object.values(allOfficers).filter(o => isValidVNCoordinate(o.lat, o.lng));
    if (officersList.length === 0) return;
    const bounds = L.latLngBounds(officersList.map(o => [o.lat, o.lng]));
    map.fitBounds(bounds, { padding: [50, 50], animate: false });
}
setTimeout(zoomToAllOfficers, 2000);

// ==================== NÚT XOÁ TẤT CẢ LỆNH DI CHUYỂN ====================
if (userRole === 'commander' || userRole === 'admin') {
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🗑️ Xoá tất cả nét vẽ di chuyển và vẽ sơ đồ';
    clearBtn.className = 'clear-orders-btn';
    clearBtn.onclick = async () => {
        if (confirm('Bạn có chắc muốn xoá TOÀN BỘ lệnh di chuyển đang hoạt động?')) {
            await remove(moveOrdersRef);
            Object.keys(moveOrderLines).forEach(orderId => {
                if (moveOrderLines[orderId]) {
                    map.removeLayer(moveOrderLines[orderId]);
                    delete moveOrderLines[orderId];
                }
            });
            alert('Đã xoá tất cả lệnh di chuyển.');
        }
    };
    document.body.appendChild(clearBtn);
}

// ==================== DIALOG THÊM ĐIỂM ====================
function showPointDialog(latlng) {
    if (drawingMode || arrowMode) return;
    const oldOverlay = document.getElementById('dialog-overlay');
    if (oldOverlay) oldOverlay.remove();
    const overlay = document.createElement('div');
    overlay.id = 'dialog-overlay';
    overlay.className = 'dialog-overlay';
    document.body.appendChild(overlay);
    const dialog = document.createElement('div');
    dialog.className = 'custom-dialog';
    
    if (userRole === 'officer') {
        dialog.innerHTML = `
            <h4>📍 Đánh dấu điểm</h4>
            <input type="text" id="point-note" placeholder="Ghi chú (bắt buộc)" />
            <div style="margin-top: 12px;">
                <button id="dialog-ok">Đánh dấu</button>
                <button id="dialog-cancel">Hủy</button>
            </div>
        `;
    } else {
        dialog.innerHTML = `
            <h4>📍 Tùy chọn tại điểm</h4>
            <input type="text" id="point-note" placeholder="Ghi chú (bắt buộc nếu đánh dấu điểm)" />
            <select id="officer-select">
                <option value="">-- Chọn cán bộ để ra lệnh (không chọn = đánh dấu điểm) --</option>
            </select>
            <div style="margin-top: 12px;">
                <button id="dialog-ok">Xác nhận</button>
                <button id="dialog-cancel">Hủy</button>
            </div>
        `;
    }
    document.body.appendChild(dialog);
    
    if (userRole !== 'officer') {
        const select = dialog.querySelector('#officer-select');
        if (select) {
            for (const [uid, officer] of Object.entries(allOfficers)) {
                if (uid !== myUsername) {
                    const name = officer.name || uid;
                    const option = document.createElement('option');
                    option.value = uid;
                    option.textContent = name;
                    select.appendChild(option);
                }
            }
        }
    }
    
    const okBtn = dialog.querySelector('#dialog-ok');
    const cancelBtn = dialog.querySelector('#dialog-cancel');
    const noteInput = dialog.querySelector('#point-note');
    if (okBtn) {
        okBtn.onclick = () => {
            const note = noteInput ? noteInput.value.trim() : '';
            if (!note) {
                alert("Vui lòng nhập ghi chú.");
                return;
            }
            if (userRole === 'officer') {
                push(ref(db, 'markers/' + myUsername), {
                    created_by: myName,
                    lat: latlng.lat,
                    lng: latlng.lng,
                    note: note,
                    timestamp: Date.now()
                });
            } else {
                const selectedOfficerUid = document.getElementById('officer-select')?.value;
                if (!selectedOfficerUid) {
                    push(ref(db, 'markers/' + myUsername), {
                        created_by: myName,
                        lat: latlng.lat,
                        lng: latlng.lng,
                        note: note,
                        timestamp: Date.now()
                    });
                } else {
                    const startOfficer = allOfficers[selectedOfficerUid];
                    if (!startOfficer || !isValidVNCoordinate(startOfficer.lat, startOfficer.lng)) {
                        alert("Không tìm thấy vị trí cán bộ này.");
                        dialog.remove();
                        overlay.remove();
                        return;
                    }
                    const orderData = {
                        officerId: selectedOfficerUid,
                        fromLat: startOfficer.lat,
                        fromLng: startOfficer.lng,
                        toLat: latlng.lat,
                        toLng: latlng.lng,
                        commanderName: myName,
                        commanderId: myUsername,
                        timestamp: Date.now(),
                        status: 'active',
                        note: note
                    };
                    push(ref(db, 'move_orders'), orderData);
                    const tempMarker = L.marker([latlng.lat, latlng.lng]).addTo(map);
                    const selectName = document.querySelector('#officer-select option:checked')?.text;
                    tempMarker.bindPopup(`📍 Đã ra lệnh cho ${selectName}`).openPopup();
                    setTimeout(() => map.removeLayer(tempMarker), 5000);
                }
            }
            dialog.remove();
            overlay.remove();
        };
    }
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            dialog.remove();
            overlay.remove();
        };
    }
}

map.on('contextmenu', (e) => {
    if (selectionMode || drawingMode || arrowMode) return;
    e.originalEvent.preventDefault();
    showPointDialog(e.latlng);
});
let touchTimer = null;
map.on('touchstart', (e) => {
    if (selectionMode || drawingMode || arrowMode) return;
    const touch = e.originalEvent.touches[0];
    const latlng = map.mouseEventToLatLng(touch);
    touchTimer = setTimeout(() => {
        showPointDialog(latlng);
    }, 800);
});
map.on('touchend', () => { if (touchTimer) clearTimeout(touchTimer); });
map.on('touchcancel', () => { if (touchTimer) clearTimeout(touchTimer); });

// ==================== RA LỆNH TỪ SIDEBAR ====================
if (userRole === 'commander' || userRole === 'admin') {
    function activateSelectionMode(officerId, officerName) {
        if (selectionMode) return;
        selectionMode = true;
        selectedOfficerId = officerId;
        selectedOfficerName = officerName;
        hasSelected = false;
        const infoControl = L.control({ position: 'topright' });
        infoControl.onAdd = () => {
            const div = L.DomUtil.create('div', 'selection-info');
            div.innerHTML = `<span>📍 Giữ 5 giây trên map để chọn điểm cho <b>${officerName}</b></span><button id="cancel-order-btn" class="cancel-btn">Hủy</button>`;
            L.DomEvent.disableClickPropagation(div);
            return div;
        };
        infoControl.addTo(map);
        tempInfoControl = infoControl;
        setTimeout(() => {
            const cancelBtn = document.getElementById('cancel-order-btn');
            if (cancelBtn) cancelBtn.onclick = () => deactivateSelectionMode();
        }, 100);
        map.getContainer().style.cursor = 'crosshair';
        map.on('touchstart', (e) => {
            if (!selectionMode || hasSelected) return;
            const touch = e.originalEvent.touches[0];
            const latlng = map.mouseEventToLatLng(touch);
            holdTimer = setTimeout(() => {
                if (hasSelected) return;
                hasSelected = true;
                const endLat = latlng.lat;
                const endLng = latlng.lng;
                const startOfficer = allOfficers[selectedOfficerId];
                if (startOfficer) {
                    const orderData = {
                        officerId: selectedOfficerId,
                        fromLat: startOfficer.lat,
                        fromLng: startOfficer.lng,
                        toLat: endLat,
                        toLng: endLng,
                        commanderName: myName,
                        commanderId: myUsername,
                        timestamp: Date.now(),
                        status: 'active',
                        note: ""
                    };
                    push(ref(db, 'move_orders'), orderData);
                    const marker = L.marker([endLat, endLng]).addTo(map);
                    marker.bindPopup("📍 Đã chọn điểm (giữ 5s)").openPopup();
                    setTimeout(() => map.removeLayer(marker), 5000);
                    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                }
                deactivateSelectionMode();
            }, 5000);
        });
        map.on('touchend', () => clearTimeout(holdTimer));
        map.on('touchcancel', () => clearTimeout(holdTimer));
    }
    function deactivateSelectionMode() {
        if (!selectionMode) return;
        if (tempInfoControl) map.removeControl(tempInfoControl);
        map.getContainer().style.cursor = '';
        if (holdTimer) clearTimeout(holdTimer);
        selectionMode = false;
        selectedOfficerId = null;
        selectedOfficerName = null;
        tempInfoControl = null;
        hasSelected = false;
    }
    if (window.pendingOrder && window.pendingOrder.officerId) {
        const checkInterval = setInterval(() => {
            if (allOfficers[window.pendingOrder.officerId]) {
                clearInterval(checkInterval);
                activateSelectionMode(window.pendingOrder.officerId, window.pendingOrder.officerName);
            }
        }, 200);
    }
}
