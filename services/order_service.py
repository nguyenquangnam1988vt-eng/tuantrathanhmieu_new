import time
from services.firebase_service import init_db, send_fcm_notification
from utils.helpers import is_valid_coordinate, haversine

def create_alert(username, name, lat, lng, nearest_officers, server_key):
    db = init_db()
    alert_data = {
        "name": name,
        "lat": lat,
        "lng": lng,
        "assigned": nearest_officers,
        "status": "pending",
        "timestamp": int(time.time() * 1000),
        "created_by": username
    }
    db.child("alerts").push(alert_data)
    if server_key:
        tokens = db.child("fcm_tokens").get().val() or {}
        for uid in nearest_officers:
            if uid != username and uid in tokens:
                token = tokens[uid].get("token") if isinstance(tokens[uid], dict) else tokens[uid]
                if token:
                    send_fcm_notification("🚨 BÁO ĐỘNG", f"Báo động từ {name}", token, server_key)

def accept_alert(username, name):
    db = init_db()
    alerts = db.child("alerts").get().val()
    if not alerts:
        return False, "Không có báo động nào"
    for key, alert in alerts.items():
        assigned = alert.get("assigned", [])
        if username in assigned and alert.get("status") == "pending":
            try:
                resolved_data = {
                    "original_id": key,
                    "name": alert.get("name"),
                    "lat": alert.get("lat"),
                    "lng": alert.get("lng"),
                    "assigned": assigned,
                    "accepted_by": name,
                    "accepted_at": int(time.time() * 1000),
                    "timestamp": alert.get("timestamp")
                }
                db.child("resolved_alerts").push(resolved_data)
                db.child("alerts").child(key).remove()
                chat_message = {
                    "from": "system",
                    "name": "Hệ thống",
                    "message": f"✅ {name} đã nhận và xử lý báo động từ {alert.get('name', 'cán bộ')}",
                    "timestamp": int(time.time() * 1000)
                }
                db.child("messages").push(chat_message)
                return True, f"Đã nhận và xóa báo động từ {alert.get('name', 'cán bộ')}"
            except Exception as e:
                return False, f"Lỗi khi nhận nhiệm vụ: {e}"
    return False, "Không có nhiệm vụ nào đang chờ xử lý cho bạn"

def create_move_order(commander_name, commander_id, officer_id, from_lat, from_lng, to_lat, to_lng, note):
    db = init_db()
    order_data = {
        "officerId": officer_id,
        "fromLat": from_lat,
        "fromLng": from_lng,
        "toLat": to_lat,
        "toLng": to_lng,
        "commanderName": commander_name,
        "commanderId": commander_id,
        "timestamp": int(time.time() * 1000),
        "status": "active",
        "note": note
    }
    db.child("move_orders").push(order_data)

def find_nearest_officers(lat, lng, limit=3):
    db = init_db()
    officers = db.child("officers").get().val()
    if not officers:
        return []
    distances = []
    for uid, data in officers.items():
        if is_valid_coordinate(data.get("lat"), data.get("lng")):
            d = haversine(lat, lng, data["lat"], data["lng"])
            distances.append((uid, d))
    distances.sort(key=lambda x: x[1])
    return [uid for uid, _ in distances[:limit]]