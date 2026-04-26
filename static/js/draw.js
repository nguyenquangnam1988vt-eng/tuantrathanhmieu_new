console.log("[Draw] Initializing draw module");

// ==================== LOGGING FUNCTION ====================
async function logArrowInteraction(action, drawingId, drawingAuthor, username, userName) {
    const logRef = ref(db, 'arrow_logs');
    await push(logRef, {
        action: action, // 'blink' or 'delete'
        drawingId: drawingId,
        drawingAuthor: drawingAuthor,
        performedBy: username,
        performedByName: userName,
        timestamp: Date.now()
    });
    console.log(`[Log] ${action} on arrow ${drawingId} by ${userName}`);
}

// ==================== VẼ SƠ ĐỒ (COMMANDER/ADMIN) ====================
if (userRole === 'commander' || userRole === 'admin') {
    const toolbar = L.control({ position: 'topright' });
    toolbar.onAdd = () => {
        const div = L.DomUtil.create('div', 'drawing-toolbar');
        div.innerHTML = `
            <div style="background:white; padding:8px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
                <button id="draw-toggle" style="margin:2px; padding:4px 8px;">✏️ Vẽ</button>
                <button id="draw-finish" style="margin:2px; padding:4px 8px; display:none; background:#4caf50; color:white;">✅ Hoàn tất</button>
                <input type="color" id="draw-color" value="${drawingColor}" style="width:30px; height:30px; margin:2px;">
                <input type="range" id="draw-weight" min="2" max="10" step="1" value="${drawingWeight}" style="width:80px; margin:2px;">
                <button id="clear-all-drawings" style="margin:2px; padding:4px 8px; background:#ff4444; color:white;">🗑️ Xóa tất cả vẽ hướng đối tượng</button>
                <button id="clear-all-alerts" style="margin:2px; padding:4px 8px; background:#ff4444; color:white;">🚨 Xoá tất cả báo động</button>
            </div>
        `;
        L.DomEvent.disableClickPropagation(div);
        return div;
    };
    toolbar.addTo(map);
    console.log("[Draw] Commander/Admin toolbar added");

    const drawToggle = document.getElementById('draw-toggle');
    const drawFinish = document.getElementById('draw-finish');
    if (drawToggle) {
        drawToggle.addEventListener('click', () => {
            drawingMode = !drawingMode;
            console.log(`[Draw] Drawing mode: ${drawingMode}`);
            if (drawingMode) {
                drawToggle.style.background = '#4caf50';
                drawToggle.style.color = 'white';
                if (drawFinish) drawFinish.style.display = 'inline-block';
                startDrawing();
            } else {
                drawToggle.style.background = '';
                drawToggle.style.color = '';
                if (drawFinish) drawFinish.style.display = 'none';
                cancelDrawing();
            }
        });
    }
    if (drawFinish) {
        drawFinish.addEventListener('click', () => {
            if (drawingMode && tempPoints.length >= 2) {
                console.log(`[Draw] Saving drawing with ${tempPoints.length} points`);
                saveDrawing();
            }
            drawingMode = false;
            if (drawToggle) drawToggle.style.background = '';
            drawFinish.style.display = 'none';
            cancelDrawing();
        });
    }
    const colorPicker = document.getElementById('draw-color');
    if (colorPicker) {
        colorPicker.addEventListener('change', (e) => { drawingColor = e.target.value; });
    }
    const weightSlider = document.getElementById('draw-weight');
    if (weightSlider) {
        weightSlider.addEventListener('change', (e) => { drawingWeight = parseInt(e.target.value); });
    }
    const clearDrawingsBtn = document.getElementById('clear-all-drawings');
    if (clearDrawingsBtn) {
        clearDrawingsBtn.addEventListener('click', async () => {
            if (confirm('Xóa tất cả nét vẽ?')) {
                console.log("[Draw] Clearing all drawings");
                await remove(ref(db, 'drawings'));
            }
        });
    }
    const clearAlertsBtn = document.getElementById('clear-all-alerts');
    if (clearAlertsBtn) {
        clearAlertsBtn.addEventListener('click', async () => {
            if (confirm('Xoá tất cả báo động đang hiển thị?')) {
                console.log("[Draw] Clearing all alerts");
                await remove(alertsRef);
                Object.keys(alertMarkers).forEach(id => removeAlertMarker(id));
            }
        });
    }
}

// ==================== VẼ MŨI TÊN CHỈ HƯỚNG MÀU XANH (CHỈ COMMANDER) ====================
if (userRole === 'commander') {
    const guideArrowToolbar = L.control({ position: 'topright' });
    guideArrowToolbar.onAdd = () => {
        const div = L.DomUtil.create('div', 'guide-arrow-toolbar');
        div.innerHTML = `
            <div style="background:white; padding:8px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.2); margin-top:5px;">
                <button id="guide-arrow-toggle" style="margin:2px; padding:4px 8px; background:#00aaff; color:white;">➡️ Vẽ mũi tên hướng dẫn (xanh)</button>
                <button id="guide-arrow-finish" style="display:none; margin:2px; padding:4px 8px; background:#4caf50; color:white;">✅ Hoàn tất</button>
                <button id="guide-arrow-cancel" style="display:none; margin:2px; padding:4px 8px; background:#999;">❌ Hủy</button>
            </div>
        `;
        L.DomEvent.disableClickPropagation(div);
        return div;
    };
    guideArrowToolbar.addTo(map);

    let guideDrawingMode = false;
    let guideTempPoints = [];
    let guideTempPolyline = null;

    const guideToggle = document.getElementById('guide-arrow-toggle');
    const guideFinish = document.getElementById('guide-arrow-finish');
    const guideCancel = document.getElementById('guide-arrow-cancel');

    function startGuideDrawing() {
        console.log("[Draw] Start guide arrow drawing");
        guideTempPoints = [];
        if (guideTempPolyline) map.removeLayer(guideTempPolyline);
        map.on('click', onGuideMapClick);
        map.getContainer().style.cursor = 'crosshair';
    }

    function cancelGuideDrawing() {
        console.log("[Draw] Cancel guide arrow drawing");
        map.off('click', onGuideMapClick);
        if (guideTempPolyline) {
            map.removeLayer(guideTempPolyline);
            guideTempPolyline = null;
        }
        guideTempPoints = [];
        map.getContainer().style.cursor = '';
        guideDrawingMode = false;
        if (guideToggle) guideToggle.style.background = '#00aaff';
        if (guideFinish) guideFinish.style.display = 'none';
        if (guideCancel) guideCancel.style.display = 'none';
    }

    function onGuideMapClick(e) {
        if (!guideDrawingMode) return;
        const { lat, lng } = e.latlng;
        guideTempPoints.push([lat, lng]);
        if (guideTempPolyline) map.removeLayer(guideTempPolyline);
        guideTempPolyline = L.polyline(guideTempPoints, {
            color: '#00aaff',
            weight: 4,
            opacity: 0.8
        }).addTo(map);
        if (guideTempPolyline.arrowheads) {
            guideTempPolyline.arrowheads({ size: '12px', frequency: '30px', color: '#00aaff' });
        }
    }

    function saveGuideDrawing() {
        if (guideTempPoints.length < 2) {
            alert("Cần ít nhất 2 điểm để vẽ mũi tên.");
            return;
        }
        const drawingData = {
            points: guideTempPoints.map(p => ({ lat: p[0], lng: p[1] })),
            color: '#00aaff',
            weight: 4,
            author: myName,
            authorId: myUsername,
            timestamp: Date.now(),
            type: 'arrow_guide'
        };
        push(ref(db, 'drawings'), drawingData);
        cancelGuideDrawing();
    }

    if (guideToggle) {
        guideToggle.addEventListener('click', () => {
            if (guideDrawingMode) {
                cancelGuideDrawing();
            } else {
                // Tắt chế độ vẽ thường nếu đang bật
                if (typeof drawingMode !== 'undefined' && drawingMode) {
                    drawingMode = false;
                    if (drawToggle) drawToggle.style.background = '';
                    if (drawFinish) drawFinish.style.display = 'none';
                    cancelDrawing();
                }
                guideDrawingMode = true;
                guideToggle.style.background = '#0088cc';
                if (guideFinish) guideFinish.style.display = 'inline-block';
                if (guideCancel) guideCancel.style.display = 'inline-block';
                startGuideDrawing();
            }
        });
    }
    if (guideFinish) {
        guideFinish.addEventListener('click', () => {
            if (guideDrawingMode && guideTempPoints.length >= 2) {
                saveGuideDrawing();
            }
            guideDrawingMode = false;
            if (guideToggle) guideToggle.style.background = '#00aaff';
            guideFinish.style.display = 'none';
            if (guideCancel) guideCancel.style.display = 'none';
            cancelGuideDrawing();
        });
    }
    if (guideCancel) {
        guideCancel.addEventListener('click', () => {
            cancelGuideDrawing();
            guideDrawingMode = false;
            if (guideToggle) guideToggle.style.background = '#00aaff';
            guideFinish.style.display = 'none';
            guideCancel.style.display = 'none';
        });
    }
}

// ==================== MŨI TÊN CŨ CHO OFFICER (giữ nguyên) ====================
if (userRole === 'officer') {
    console.log("[Draw] Officer arrow mode initialized");
    const arrowToolbar = L.control({ position: 'topright' });
    arrowToolbar.onAdd = () => {
        const div = L.DomUtil.create('div', 'drawing-toolbar');
        div.innerHTML = `
            <div style="background:white; padding:8px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
                <button id="arrow-toggle" style="margin:2px; padding:4px 8px; background:#ff0000; color:white;">🚨 Báo hướng đối tượng</button>
            </div>
        `;
        L.DomEvent.disableClickPropagation(div);
        return div;
    };
    arrowToolbar.addTo(map);

    const arrowToggle = document.getElementById('arrow-toggle');
    if (arrowToggle) {
        arrowToggle.addEventListener('click', () => {
            if (arrowMode) {
                arrowMode = false;
                arrowToggle.style.background = '#ff0000';
                arrowToggle.style.color = 'white';
                if (arrowTempLine) map.removeLayer(arrowTempLine);
                arrowStart = null;
                map.getContainer().style.cursor = '';
                console.log("[Draw] Arrow mode disabled");
            } else {
                arrowMode = true;
                arrowToggle.style.background = '#cc0000';
                arrowToggle.style.color = 'white';
                map.getContainer().style.cursor = 'crosshair';
                arrowStart = null;
                if (arrowTempLine) map.removeLayer(arrowTempLine);
                console.log("[Draw] Arrow mode enabled");
            }
        });
    }

    function handleArrowClick(e) {
        if (!arrowMode) return;
        const { lat, lng } = e.latlng;
        if (arrowStart === null) {
            arrowStart = [lat, lng];
            arrowTempLine = L.circleMarker(arrowStart, { radius: 8, color: 'red', fillColor: 'red', fillOpacity: 0.7 }).addTo(map);
            console.log(`[Draw] Arrow start at ${lat},${lng}`);
        } else {
            const start = arrowStart;
            const end = [lat, lng];
            const arrowLine = L.polyline([start, end], { color: 'red', weight: 4, opacity: 0.9 }).addTo(map);
            if (arrowLine.arrowheads) arrowLine.arrowheads({ size: '15px', frequency: 'all', color: 'red' });
            const drawingData = {
                points: [{ lat: start[0], lng: start[1] }, { lat: end[0], lng: end[1] }],
                color: 'red',
                weight: 4,
                author: myName,
                authorId: myUsername,
                timestamp: Date.now(),
                type: 'arrow'
            };
            push(ref(db, 'drawings'), drawingData);
            const alertData = {
                name: `Hướng di chuyển từ ${myName}`,
                lat: end[0],
                lng: end[1],
                assigned: [],
                status: 'pending',
                timestamp: Date.now(),
                created_by: myUsername,
                arrowAlert: true
            };
            push(ref(db, 'alerts'), alertData);
            console.log(`[Draw] Arrow drawn from (${start[0]},${start[1]}) to (${end[0]},${end[1]})`);
            arrowMode = false;
            if (arrowToggle) arrowToggle.style.background = '#ff0000';
            map.getContainer().style.cursor = '';
            if (arrowTempLine) map.removeLayer(arrowTempLine);
            arrowStart = null;
            alert('Đã gửi báo hướng di chuyển!');
        }
    }
    map.on('click', handleArrowClick);
}

// ==================== DRAWINGS - INCREMENTAL (có bổ sung nút blink và log) ====================
const drawingsRef = ref(db, 'drawings');
console.log("[Draw] Listening for drawings");

// Hàm xử lý xoá và blink (đã tích hợp log)
document.addEventListener('click', async (e) => {
    if (e.target && e.target.classList.contains('delete-drawing')) {
        const id = e.target.getAttribute('data-id');
        if (!id) return;
        const drawingSnap = await get(ref(db, 'drawings/' + id));
        const drawing = drawingSnap.val();
        if (drawing && drawing.type === 'arrow_guide') {
            if (confirm(`Xóa mũi tên hướng dẫn này? (Hành động sẽ được ghi log)`)) {
                await logArrowInteraction('delete', id, drawing.author, myUsername, myName);
                await remove(ref(db, 'drawings/' + id));
            }
        } else {
            if (confirm("Xóa nét vẽ này?")) {
                await remove(ref(db, 'drawings/' + id));
            }
        }
    } else if (e.target && e.target.classList.contains('blink-drawing')) {
        const id = e.target.getAttribute('data-id');
        if (!id) return;
        const drawingSnap = await get(ref(db, 'drawings/' + id));
        const drawing = drawingSnap.val();
        if (drawing && drawing.type === 'arrow_guide') {
            const polyline = drawingLayers[id];
            if (polyline) {
                let blinkCount = 0;
                const originalColor = drawing.color || '#00aaff';
                const blinkInterval = setInterval(() => {
                    if (blinkCount >= 6) {
                        clearInterval(blinkInterval);
                        polyline.setStyle({ color: originalColor, opacity: 0.8 });
                    } else {
                        const newColor = blinkCount % 2 === 0 ? '#ffff00' : originalColor;
                        polyline.setStyle({ color: newColor, opacity: 1 });
                        blinkCount++;
                    }
                }, 300);
                await logArrowInteraction('blink', id, drawing.author, myUsername, myName);
                // Có thể hiển thị thông báo nhẹ
                const popup = L.popup()
                    .setLatLng(polyline.getBounds().getCenter())
                    .setContent(`🚦 ${myName} đã báo đoàn đang đi trên mũi tên này`)
                    .openOn(map);
                setTimeout(() => map.closePopup(popup), 2000);
            } else {
                alert("Không tìm thấy đường vẽ để nhấp nháy");
            }
        } else {
            alert("Chỉ có thể nhấp nháy trên mũi tên hướng dẫn");
        }
    }
});

// Thêm mới drawings
onChildAdded(drawingsRef, (snapshot) => {
    const id = snapshot.key;
    const drawing = snapshot.val();
    if (!drawing || !drawing.points || drawing.points.length < 2) return;
    if (drawingLayers[id]) return;
    console.log(`[Draw] New drawing added: ${id} from ${drawing.author}`);
    const latlngs = drawing.points.map(p => [p.lat, p.lng]);
    const polyline = L.polyline(latlngs, {
        color: drawing.color || '#ff0000',
        weight: drawing.weight || 3,
        opacity: 0.8
    }).addTo(map);
    if (drawing.type === 'arrow' && polyline.arrowheads) {
        polyline.arrowheads({ size: '15px', frequency: 'all', color: drawing.color || 'red' });
    }
    if (drawing.type === 'arrow_guide' && polyline.arrowheads) {
        polyline.arrowheads({ size: '12px', frequency: '30px', color: drawing.color || '#00aaff' });
    }
    let popupContent = `✏️ Vẽ bởi: ${drawing.author}<br>${new Date(drawing.timestamp).toLocaleString()}`;
    const canDelete = (userRole === 'commander' || userRole === 'admin' || drawing.authorId === myUsername);
    if (canDelete) {
        popupContent += `<br><button class="delete-drawing" data-id="${id}">🗑️ Xóa nét vẽ</button>`;
    }
    // Chỉ hiển thị nút nhấp nháy cho arrow_guide và nếu là commander hoặc officer
    if (drawing.type === 'arrow_guide' && (userRole === 'commander' || userRole === 'officer')) {
        popupContent += `<br><button class="blink-drawing" data-id="${id}" style="background:#ffaa00; margin-top:5px;">🚦 Báo đoàn đang đi (nhấp nháy)</button>`;
    }
    polyline.bindPopup(popupContent);
    drawingLayers[id] = polyline;
});

onChildRemoved(drawingsRef, (snapshot) => {
    const id = snapshot.key;
    console.log(`[Draw] Drawing removed: ${id}`);
    if (drawingLayers[id]) {
        map.removeLayer(drawingLayers[id]);
        delete drawingLayers[id];
    }
});

onValue(drawingsRef, (snapshot) => {
    const data = snapshot.val() || {};
    const currentIds = new Set(Object.keys(data));
    Object.keys(drawingLayers).forEach(id => {
        if (!currentIds.has(id)) {
            console.log(`[Draw] Cleaning up stale drawing layer: ${id}`);
            map.removeLayer(drawingLayers[id]);
            delete drawingLayers[id];
        }
    });
});
