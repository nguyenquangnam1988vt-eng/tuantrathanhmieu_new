import streamlit as st
import streamlit_authenticator as stauth
import yaml
from yaml.loader import SafeLoader
import json
import time
from datetime import datetime, timezone, timedelta
import base64
import os

# Import các module đã tách
from config import get_cookie_key, get_fcm_server_key, get_fcm_vapid_key, get_imgbb_api_key
from services.firebase_service import (
    init_db, load_credentials_from_firebase, save_credentials_to_firebase,
    load_officers_cached, load_all_markers, load_incidents,
    cleanup_old_data, cleanup_offline_officers, detect_stationary_officers
)
from services.chat_service import get_messages, send_message, cleanup_old_messages
from services.order_service import create_alert, accept_alert, find_nearest_officers
from utils.helpers import get_base64, is_valid_coordinate, upload_to_imgbb

# ==================== CẤU HÌNH TRANG ====================
st.set_page_config(page_title="Tuần tra cơ động", layout="wide")

# CSS (giữ nguyên)
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

* {
    font-family: 'Inter', sans-serif;
}

.stApp {
    background: #f3f4f6;
}

section[data-testid="stSidebar"] {
    background: #ffffff;
    border-right: 1px solid #e5e7eb;
}
section[data-testid="stSidebar"] .stMarkdown,
section[data-testid="stSidebar"] .stText,
section[data-testid="stSidebar"] .stSelectbox label,
section[data-testid="stSidebar"] .stCheckbox label {
    color: #1f2937 !important;
}
section[data-testid="stSidebar"] .stButton button {
    background: #2563eb;
    color: white;
    border-radius: 8px;
    font-weight: 500;
}
section[data-testid="stSidebar"] .stButton button:hover {
    background: #1d4ed8;
}
section[data-testid="stSidebar"] .stSelectbox div[data-baseweb="select"] {
    background-color: #f9fafb;
    border-color: #d1d5db;
}
section[data-testid="stSidebar"] .stTextInput input,
section[data-testid="stSidebar"] .stTextArea textarea {
    background-color: #f9fafb;
    border-color: #d1d5db;
    color: #1f2937;
}

.stButton button {
    border-radius: 8px;
    font-weight: 500;
    border: none;
    transition: 0.2s;
}

.dashboard-card {
    background: white;
    padding: 20px;
    border-radius: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    margin-bottom: 20px;
}

.custom-header {
    margin-bottom: 1.5rem;
}
.custom-header h2 {
    color: #1f2937;
    margin-bottom: 0;
    font-weight: 700;
}
.custom-header p {
    color: #6b7280;
    margin-top: 4px;
}

.sidebar-group {
    margin-bottom: 24px;
}
.sidebar-group h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
    margin-bottom: 12px;
    font-weight: 600;
}
.sidebar-card {
    background: #f9fafb;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 12px;
    border: 1px solid #e5e7eb;
}
</style>
""", unsafe_allow_html=True)

st.markdown("""
<div class="custom-header">
    <h2>🚔 Hệ thống điều hành tuần tra</h2>
    <p>Realtime tracking & coordination</p>
</div>
""", unsafe_allow_html=True)

# ==================== AUTHENTICATION ====================
credentials_data = load_credentials_from_firebase()
try:
    with open("config.yaml") as file:
        config_yaml = yaml.load(file, Loader=SafeLoader)
        cookie_config = config_yaml.get("cookie", {})
except:
    cookie_config = {}

config = {
    "credentials": credentials_data,
    "cookie": {
        "expiry_days": cookie_config.get("expiry_days", 7),
        "key": get_cookie_key(),
        "name": cookie_config.get("name", "tuan_tra_cookie")
    }
}

authenticator = stauth.Authenticate(
    config["credentials"],
    config["cookie"]["name"],
    config["cookie"]["key"],
    config["cookie"]["expiry_days"],
)

authenticator.login(location="main")
authentication_status = st.session_state.get("authentication_status")
name = st.session_state.get("name")
username = st.session_state.get("username")

if authentication_status == False:
    st.error("Sai tên đăng nhập hoặc mật khẩu")
    st.stop()
elif authentication_status == None:
    st.warning("Vui lòng đăng nhập")
    st.stop()

authenticator.logout("Đăng xuất", "sidebar")
st.sidebar.success(f"Xin chào {name}")

# ==================== THÔNG TIN USER ====================
user_role = config["credentials"]["usernames"][username].get("role", "officer")
user_color = config["credentials"]["usernames"][username].get("color", "#0066cc")

user_colors = {}
for uid, data in config["credentials"]["usernames"].items():
    role = data.get("role", "officer")
    if role == "admin":
        user_colors[uid] = "#FFD700"
    elif role == "commander":
        user_colors[uid] = "#FF4500"
    else:
        user_colors[uid] = data.get("color", "#0066cc")

# Khởi tạo Firebase DB
db = init_db()

# Xóa dữ liệu vị trí cũ nếu quá hạn
existing = db.child("officers").child(username).get().val()
if existing:
    last_update = existing.get("lastUpdate")
    now_ms = int(time.time() * 1000)
    if last_update and (now_ms - int(last_update)) > 20 * 60 * 1000:
        db.child("officers").child(username).remove()
        st.sidebar.info("Đã xóa dữ liệu vị trí cũ (quá hạn). Vui lòng bắt đầu chia sẻ lại.")
    else:
        st.sidebar.info("Đã khôi phục vị trí từ phiên trước.")

db.child("users").child(username).set({
    "name": name,
    "role": user_role,
    "color": user_colors[username],
    "last_seen": int(time.time() * 1000)
})

# ==================== CHIA SẺ VỊ TRÍ ====================
if "sharing" not in st.session_state:
    existing = db.child("officers").child(username).get().val()
    st.session_state.sharing = existing and existing.get("lastUpdate")

col1, col2 = st.columns([1, 5])
with col1:
    if not st.session_state.sharing:
        if st.button("📡 Bắt đầu chia sẻ vị trí"):
            db.child("officers").child(username).remove()
            st.session_state.sharing = True
            st.rerun()
    else:
        if st.button("🛑 Dừng chia sẻ"):
            db.child("officers").child(username).remove()
            st.session_state.sharing = False
            st.rerun()

# ==================== SIDEBAR: CÁC CHỨC NĂNG ====================
st.sidebar.markdown('<div class="sidebar-group"><h3>🚨 ĐIỀU HÀNH</h3></div>', unsafe_allow_html=True)
with st.sidebar:
    st.markdown('<div class="sidebar-card">', unsafe_allow_html=True)
    if st.button("🚨 Gửi báo động", key="alert_btn"):
        user_data = db.child("officers").child(username).get().val()
        if user_data and is_valid_coordinate(user_data.get("lat"), user_data.get("lng")):
            lat = user_data["lat"]
            lng = user_data["lng"]
            nearest = find_nearest_officers(lat, lng)
            create_alert(username, name, lat, lng, nearest, get_fcm_server_key())
            st.success("Đã gửi báo động!")
        else:
            st.error("Bạn chưa chia sẻ vị trí hợp lệ hoặc vị trí không xác định")
    st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<div class="sidebar-card">', unsafe_allow_html=True)
    if st.button("✅ Nhận nhiệm vụ gần nhất", key="accept_mission"):
        success, msg = accept_alert(username, name)
        if success:
            st.success(msg)
        else:
            st.info(msg)
    st.markdown('</div>', unsafe_allow_html=True)

st.sidebar.markdown('<div class="sidebar-group"><h3>📍 TÁC VỤ CÁ NHÂN</h3></div>', unsafe_allow_html=True)
with st.sidebar:
    with st.expander("📍 Đánh dấu điểm"):
        note = st.text_area("Ghi chú")
        if st.button("Thêm điểm tại vị trí hiện tại"):
            current = db.child("officers").child(username).get().val()
            if current and is_valid_coordinate(current.get("lat"), current.get("lng")) and note.strip():
                marker_data = {
                    "created_by": name,
                    "lat": current["lat"],
                    "lng": current["lng"],
                    "note": note,
                    "timestamp": int(time.time() * 1000),
                }
                db.child("markers").child(username).push(marker_data)
                st.success("Đã thêm điểm")
            else:
                st.warning("Chưa chia sẻ vị trí hợp lệ hoặc ghi chú trống")

    with st.expander("📸 Chụp ảnh hiện trường"):
        uploaded_file = st.file_uploader("Chọn ảnh", type=['jpg', 'jpeg', 'png'])
        note_photo = st.text_input("Ghi chú (tùy chọn)")
        if st.button("📤 Gửi ảnh"):
            if not st.session_state.sharing:
                st.warning("Bạn cần bật chia sẻ vị trí trước")
            elif uploaded_file is None:
                st.warning("Vui lòng chọn ảnh")
            else:
                current = db.child("officers").child(username).get().val()
                if current and is_valid_coordinate(current.get("lat"), current.get("lng")):
                    image_url, error = upload_to_imgbb(uploaded_file, get_imgbb_api_key())
                    if error:
                        st.error(f"Lỗi upload: {error}")
                    else:
                        incident_data = {
                            "created_by": name,
                            "lat": current["lat"],
                            "lng": current["lng"],
                            "note": note_photo,
                            "image_url": image_url,
                            "timestamp": int(time.time() * 1000)
                        }
                        db.child("incidents").push(incident_data)
                        st.success("Đã gửi ảnh hiện trường!")
                else:
                    st.error("Không có vị trí hợp lệ")

# ==================== HỆ THỐNG CHO COMMANDER/ADMIN ====================
if user_role in ["commander", "admin"]:
    st.sidebar.markdown('<div class="sidebar-group"><h3>⚙️ HỆ THỐNG</h3></div>', unsafe_allow_html=True)
    if user_role == "commander":
        with st.sidebar:
            st.markdown('<div class="sidebar-card">', unsafe_allow_html=True)
            if st.button("🗑️ Xóa ghi chú (toàn bộ)", key="delete_all_markers"):
                try:
                    db.child("markers").remove()
                    st.success("Đã xóa toàn bộ ghi chú!")
                except Exception as e:
                    st.error(f"Lỗi xóa: {e}")
            if st.button("📸 Xóa tất cả ảnh hiện trường", key="delete_all_incidents"):
                try:
                    db.child("incidents").remove()
                    st.success("Đã xóa toàn bộ ảnh hiện trường!")
                except Exception as e:
                    st.error(f"Lỗi xóa: {e}")
            st.markdown('</div>', unsafe_allow_html=True)

    if user_role == "admin":
        with st.sidebar:
            with st.expander("👤 Quản lý tài khoản"):
                with st.form("add_user_form"):
                    new_username = st.text_input("Tên đăng nhập")
                    new_email = st.text_input("Email")
                    new_name = st.text_input("Tên hiển thị")
                    new_password = st.text_input("Mật khẩu", type="password")
                    new_role = st.selectbox("Vai trò", ["admin", "commander", "officer"])
                    new_color = st.color_picker("Màu sắc", "#0066cc")
                    if st.form_submit_button("Tạo tài khoản"):
                        if not new_username or not new_name or not new_password:
                            st.error("Vui lòng nhập đầy đủ")
                        elif new_username in config["credentials"]["usernames"]:
                            st.error("Tên đăng nhập đã tồn tại")
                        else:
                            from streamlit_authenticator.utilities.hasher import Hasher
                            hashed = Hasher([new_password]).generate()[0]
                            config["credentials"]["usernames"][new_username] = {
                                "email": new_email,
                                "name": new_name,
                                "password": hashed,
                                "role": new_role,
                                "color": new_color
                            }
                            if save_credentials_to_firebase(config["credentials"]):
                                st.success(f"Đã thêm user {new_username}")
                                st.rerun()
                            else:
                                st.error("Lỗi lưu dữ liệu")
                with st.form("delete_user_form"):
                    users = list(config["credentials"]["usernames"].keys())
                    if users:
                        user_to_delete = st.selectbox("Chọn user để xóa", users)
                        if st.form_submit_button("Xóa user"):
                            if user_to_delete == username:
                                st.error("Không thể xóa chính mình")
                            else:
                                del config["credentials"]["usernames"][user_to_delete]
                                if save_credentials_to_firebase(config["credentials"]):
                                    st.success(f"Đã xóa user {user_to_delete}")
                                    st.rerun()
                                else:
                                    st.error("Lỗi lưu dữ liệu")
                    else:
                        st.info("Không có user nào")

# ==================== LỊCH SỬ DI CHUYỂN (CHECKBOX TRACK) ====================
st.sidebar.markdown('<div class="sidebar-group"><h3>🗺️ LỊCH SỬ DI CHUYỂN</h3></div>', unsafe_allow_html=True)
if 'show_tracks' not in st.session_state:
    st.session_state.show_tracks = {}

officers = load_officers_cached()
for uid, info in officers.items():
    key = f"track_{uid}"
    checked = st.sidebar.checkbox(
        f"Track của {info['name']}",
        value=st.session_state.show_tracks.get(uid, False),
        key=key
    )
    st.session_state.show_tracks[uid] = checked

# ==================== CHUẨN BỊ DỮ LIỆU CHO MAP ====================
alert_sound_base64 = get_base64("alert.mp3")
show_tracks_json = json.dumps(st.session_state.get("show_tracks", {}))
fcm_vapid_key = get_fcm_vapid_key()
stationary_officers = detect_stationary_officers()
stationary_json = json.dumps(stationary_officers)
user_colors_json = json.dumps(user_colors)
user_role_json = json.dumps(user_role)
initial_officers = load_officers_cached()
initial_officers_json = json.dumps(initial_officers)
firebase_config = dict(st.secrets["firebase"])
firebase_config_json = json.dumps(firebase_config)

# Xóa officers quá hạn lần cuối
try:
    officers_old = db.child("officers").get().val()
    if officers_old:
        now = int(time.time() * 1000)
        online_limit = 20 * 60 * 1000
        for uid, data in officers_old.items():
            last_update = data.get("lastUpdate")
            if last_update and (now - int(last_update)) > online_limit:
                db.child("officers").child(uid).remove()
except:
    pass

# ==================== ĐỌC TEMPLATE MAP VÀ CÁC FILE JS ====================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def read_js_file(filename):
    path = os.path.join(BASE_DIR, "static", "js", filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"JS load error for {filename}: {e}")
        return ""

map_js = read_js_file("map.js")
alerts_js = read_js_file("alerts.js")
draw_js = read_js_file("draw.js")
tracking_js = read_js_file("tracking.js")
events_js = read_js_file("events.js")

map_template_path = os.path.join(BASE_DIR, "templates", "map.html")
with open(map_template_path, "r", encoding="utf-8") as f:
    map_template = f.read()

# Thay thế các placeholder
map_html = map_template
map_html = map_html.replace("{{ firebase_config }}", firebase_config_json)
map_html = map_html.replace("{{ username }}", username)
map_html = map_html.replace("{{ name }}", name)
map_html = map_html.replace("{{ user_role }}", user_role_json)
map_html = map_html.replace("{{ show_tracks }}", show_tracks_json)
map_html = map_html.replace("{{ stationary_officers }}", stationary_json)
map_html = map_html.replace("{{ user_colors }}", user_colors_json)
map_html = map_html.replace("{{ initial_officers }}", initial_officers_json)
map_html = map_html.replace("{{ alert_sound_base64 }}", alert_sound_base64)
map_html = map_html.replace("{{ fcm_vapid_key }}", fcm_vapid_key)
# Chèn các đoạn script
map_html = map_html.replace("<!-- MAP_JS -->", map_js)
map_html = map_html.replace("<!-- ALERTS_JS -->", alerts_js)
map_html = map_html.replace("<!-- DRAW_JS -->", draw_js)
map_html = map_html.replace("<!-- TRACKING_JS -->", tracking_js)
map_html = map_html.replace("<!-- EVENTS_JS -->", events_js)

# ==================== HIỂN THỊ MAP, DASHBOARD VÀ CHAT ====================
st.markdown('<div class="dashboard-card">', unsafe_allow_html=True)
tab1, tab2, tab3 = st.tabs(["🗺️ Bản đồ", "📊 Thống kê & Nhật ký", "💬 Chat nội bộ"])
with tab1:
    st.components.v1.html(map_html, height=620)
with tab2:
    st.subheader("📊 Thống kê hệ thống")
    col1, col2 = st.columns(2)
    
    # Số cán bộ online (dựa trên lastSeen trong 30 giây)
    officers_data = db.child("officers").get().val()
    now_ms = int(time.time() * 1000)
    online_count = 0
    if officers_data:
        for uid, info in officers_data.items():
            last_seen = info.get("lastSeen")
            if last_seen and (now_ms - last_seen) < 30000:
                online_count += 1
    col1.metric("👮 Cán bộ online", online_count)
    
    # Số vụ việc (incidents)
    incidents_data = db.child("incidents").get().val()
    incident_count = len(incidents_data) if incidents_data else 0
    col2.metric("📸 Số vụ việc", incident_count)
    
    # Nhật ký điều hành
    st.markdown("### 🧭 Nhật ký điều hành")
    logs_data = db.child("logs").order_by_child("time").limit_to_last(20).get()
    if logs_data and logs_data.val():
        logs_list = sorted(logs_data.val().items(), key=lambda x: x[1]["time"], reverse=True)
        for key, log in logs_list:
            dt = datetime.fromtimestamp(log["time"]/1000, tz=timezone(timedelta(hours=7))).strftime("%H:%M:%S %d/%m")
            st.write(f"🧑‍✈️ **{log.get('commander', '?')}** → 👮 **{log.get('targetName', '?')}** tại ({log.get('lat', 0):.5f}, {log.get('lng', 0):.5f}) lúc {dt}")
            if log.get('note'):
                st.caption(f"📝 {log['note']}")
    else:
        st.info("Chưa có nhật ký điều hành.")
with tab3:
    st.subheader("💬 Chat nội bộ")
    cleanup_old_messages()
    messages = get_messages()
    if messages:
        sorted_msgs = sorted(messages.items(), key=lambda x: x[1]["timestamp"])
        for key, msg in sorted_msgs:
            vn_time = datetime.fromtimestamp(
                msg["timestamp"]/1000, tz=timezone(timedelta(hours=7))
            ).strftime("%H:%M")
            is_system = msg["from"] == "system"
            if is_system:
                avatar = "🤖"
                bg_color = "#e5e7eb"
                align = "center"
            else:
                is_me = (msg["from"] == username)
                avatar = msg['name'][0].upper()
                bg_color = "#dcf8c6" if is_me else "#f1f0f0"
                align = "right" if is_me else "left"
            st.markdown(
                f"""
                <div style='display:flex; justify-content:{align}; margin:10px 0;'>
                    <div style='display:flex; align-items:flex-end; max-width:80%; gap:8px;'>
                        {"<div style='order:2;' " if not is_system and is_me else ""}
                            <div style='background:{bg_color}; padding:10px 15px; border-radius:15px; box-shadow:0 2px 8px rgba(0,0,0,0.1);'>
                                <b>{msg['name']}</b> <span style='font-size:10px; color:gray'>{vn_time}</span><br>
                                {msg['message']}
                            </div>
                        {"</div>" if not is_system and is_me else ""}
                        <div style='width:36px; height:36px; background: #2563eb; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:white;'>
                            {avatar}
                        </div>
                        {"<div style='order:2;' " if not is_system and not is_me else ""}</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True
            )
        st.markdown("<script>window.scrollTo(0, document.body.scrollHeight);</script>", unsafe_allow_html=True)
    else:
        st.info("Chưa có tin nhắn nào.")
    
    if 'last_chat_time' not in st.session_state:
        st.session_state.last_chat_time = 0
    
    with st.form("chat_form", clear_on_submit=True):
        col1, col2 = st.columns([5,1])
        with col1:
            message = st.text_input("Tin nhắn", placeholder="Nhập tin nhắn...", label_visibility="collapsed")
        with col2:
            sent = st.form_submit_button("Gửi")
        if sent and message.strip():
            now = time.time()
            if now - st.session_state.last_chat_time < 2:
                st.warning("Vui lòng chờ 2 giây trước khi gửi tin nhắn tiếp theo.")
            else:
                st.session_state.last_chat_time = now
                send_message(username, name, message)
                st.rerun()

st.markdown('</div>', unsafe_allow_html=True)

# ==================== THÔNG TIN PHỤ TRONG SIDEBAR ====================
st.sidebar.markdown('<div class="sidebar-group"><h3>👥 TRỰC TUYẾN</h3></div>', unsafe_allow_html=True)
officers = load_officers_cached()
if officers:
    for uid, info in officers.items():
        label = "(bạn)" if uid == username else ""
        st.sidebar.write(f"• {info['name']} {label}")
else:
    st.sidebar.write("Chưa có ai chia sẻ vị trí hợp lệ")

all_markers = load_all_markers()
incidents = load_incidents()
st.sidebar.markdown('<div class="sidebar-group"><h3>📌 ĐIỂM ĐÁNH DẤU GẦN ĐÂY</h3></div>', unsafe_allow_html=True)
if all_markers:
    valid_markers = {k: v for k, v in all_markers.items() if isinstance(v, dict) and v.get("timestamp")}
    if valid_markers:
        sorted_markers = sorted(valid_markers.items(), key=lambda x: x[1]["timestamp"], reverse=True)[:5]
        for _, m in sorted_markers:
            st.sidebar.write(f"📍 {m.get('created_by', 'Unknown')}: {m.get('note', '')[:30]}...")
    else:
        st.sidebar.write("Chưa có điểm đánh dấu hợp lệ")
else:
    st.sidebar.write("Chưa có điểm đánh dấu")

st.sidebar.markdown('<div class="sidebar-group"><h3>📸 ẢNH HIỆN TRƯỜNG GẦN ĐÂY</h3></div>', unsafe_allow_html=True)
if incidents:
    sorted_inc = sorted(incidents.items(), key=lambda x: x[1]["timestamp"], reverse=True)[:5]
    for key, inc in sorted_inc:
        st.sidebar.write(f"📷 {inc['created_by']}: {inc.get('note', '')[:30]}...")
else:
    st.sidebar.write("Chưa có ảnh hiện trường")

if user_role == "commander" and officers:
    st.sidebar.markdown('<div class="sidebar-group"><h3>🚶 RA LỆNH DI CHUYỂN</h3></div>', unsafe_allow_html=True)
    st.sidebar.markdown('<div class="sidebar-card">', unsafe_allow_html=True)
    officer_options = {uid: info['name'] for uid, info in officers.items() if uid != username}
    if officer_options:
        selected_officer = st.sidebar.selectbox(
            "Chọn cán bộ",
            options=list(officer_options.keys()),
            format_func=lambda x: officer_options[x]
        )
        if st.sidebar.button("📍 Bắt đầu chọn điểm đến"):
            st.session_state['order_officer_id'] = selected_officer
            st.session_state['order_officer_name'] = officer_options[selected_officer]
            st.rerun()
    else:
        st.sidebar.info("Không có cán bộ khác trực tuyến")
    st.sidebar.markdown('</div>', unsafe_allow_html=True)

# ==================== CLEANUP ĐỊNH KỲ ====================
if "last_cleanup" not in st.session_state or time.time() - st.session_state.last_cleanup > 60:
    cleanup_old_data()
    cleanup_offline_officers()
    st.session_state.last_cleanup = time.time()
