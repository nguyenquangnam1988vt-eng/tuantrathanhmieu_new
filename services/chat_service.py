import time
from services.firebase_service import init_db

def get_messages():
    db = init_db()
    messages = db.child("messages").order_by_child("timestamp").limit_to_last(50).get()
    return messages.val() if messages.val() else {}

def send_message(username, name, message):
    db = init_db()
    chat_data = {
        "from": username,
        "name": name,
        "message": message,
        "timestamp": int(time.time() * 1000)
    }
    db.child("messages").push(chat_data)
    # Giới hạn 200 tin nhắn mới nhất
    all_msgs = db.child("messages").order_by_child("timestamp").get().val()
    if all_msgs and len(all_msgs) > 200:
        sorted_all = sorted(all_msgs.items(), key=lambda x: x[1]["timestamp"])
        for k, _ in sorted_all[:-200]:
            db.child("messages").child(k).remove()

def cleanup_old_messages():
    db = init_db()
    msgs = db.child("messages").get().val()
    if not msgs:
        return
    now = int(time.time() * 1000)
    for key, msg in msgs.items():
        if now - msg.get("timestamp", 0) > 24 * 3600 * 1000:
            db.child("messages").child(key).remove()