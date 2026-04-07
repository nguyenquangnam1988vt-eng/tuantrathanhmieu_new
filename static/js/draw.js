console.log("[Draw] Initializing draw module");

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

// ==================== VẼ MŨI TÊN CHO OFFICER ====================
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

// ==================== DRAWINGS - INCREMENTAL ====================
const drawingsRef = ref(db, 'drawings');
console.log("[Draw] Listening for drawings");

document.addEventListener('click', async (e) => {
    if (e.target && e.target.classList.contains('delete-drawing')) {
        const id = e.target.getAttribute('data-id');
        if (!id) return;
        if (confirm("Xóa nét vẽ này?")) {
            console.log(`[Draw] Deleting drawing ${id}`);
            await remove(ref(db, 'drawings/' + id));
        }
    }
});

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
    let popupContent = `✏️ Vẽ bởi: ${drawing.author}<br>${new Date(drawing.timestamp).toLocaleString()}`;
    const canDelete = (userRole === 'commander' || userRole === 'admin' || drawing.authorId === myUsername);
    if (canDelete) {
        popupContent += `<br><button class="delete-drawing" data-id="${id}">🗑️ Xóa nét vẽ</button>`;
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
