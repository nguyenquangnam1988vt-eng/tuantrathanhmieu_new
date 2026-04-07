// ==================== CÁC HÀM VẼ ====================
function startDrawing() {
    tempPoints = [];
    if (tempPolyline) map.removeLayer(tempPolyline);
    map.on('click', onMapClick);
    map.getContainer().style.cursor = 'crosshair';
}

function cancelDrawing() {
    map.off('click', onMapClick);
    if (tempPolyline) {
        map.removeLayer(tempPolyline);
        tempPolyline = null;
    }
    tempPoints = [];
    map.getContainer().style.cursor = '';
}

function onMapClick(e) {
    if (!drawingMode) return;
    const { lat, lng } = e.latlng;
    tempPoints.push([lat, lng]);

    if (tempPolyline) map.removeLayer(tempPolyline);

    tempPolyline = L.polyline(tempPoints, {
        color: drawingColor,
        weight: drawingWeight,
        opacity: 0.8
    }).addTo(map);
}

function saveDrawing() {
    if (tempPoints.length < 2) {
        alert("Cần ít nhất 2 điểm để vẽ.");
        return;
    }

    const drawingData = {
        points: tempPoints.map(p => ({ lat: p[0], lng: p[1] })),
        color: drawingColor,
        weight: drawingWeight,
        author: myName,
        authorId: myUsername,
        timestamp: Date.now(),
        type: 'draw'
    };

    push(ref(db, 'drawings'), drawingData);

    cancelDrawing();
    drawingMode = false;

    const drawToggle = document.getElementById('draw-toggle');
    const drawFinish = document.getElementById('draw-finish');

    if (drawToggle) drawToggle.style.background = '';
    if (drawFinish) drawFinish.style.display = 'none';
}
