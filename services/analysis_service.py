# services/analysis_service.py
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from collections import defaultdict
from services.firebase_service import init_db
from services.hotspot_service import get_incident_data
from utils.helpers import is_valid_coordinate
import logging

logger = logging.getLogger(__name__)

def get_track_data(days_back=7):
    """
    Lấy dữ liệu track (lịch sử di chuyển) từ Firebase trong khoảng thời gian.
    Trả về DataFrame với các cột: lat, lng, userId, timestamp
    """
    db = init_db()
    tracks = db.child("tracks").get().val()
    if not tracks:
        logger.warning("No track data found")
        return pd.DataFrame(columns=['lat', 'lng', 'userId', 'timestamp'])
    
    data = []
    now = datetime.now()
    cutoff = now - timedelta(days=days_back)
    
    for userId, user_data in tracks.items():
        points = user_data.get("points", {})
        if not points:
            continue
        for key, point in points.items():
            ts = point.get("timestamp")
            if not ts:
                continue
            dt = datetime.fromtimestamp(ts/1000)
            if dt < cutoff:
                continue
            lat = point.get("lat")
            lng = point.get("lng")
            if is_valid_coordinate(lat, lng):
                data.append({
                    'lat': lat,
                    'lng': lng,
                    'userId': userId,
                    'timestamp': ts
                })
    df = pd.DataFrame(data)
    logger.info(f"Loaded {len(df)} track points for analysis")
    return df

def create_grid(lat_min=8, lat_max=24, lng_min=102, lng_max=110, step=0.05):
    """
    Tạo lưới ô vuông (grid) với kích thước step (độ).
    Mỗi ô được xác định bởi index (i, j).
    """
    lats = np.arange(lat_min, lat_max, step)
    lngs = np.arange(lng_min, lng_max, step)
    grid = []
    for i, lat in enumerate(lats):
        for j, lng in enumerate(lngs):
            grid.append({
                'i': i, 'j': j,
                'lat_min': lat, 'lat_max': lat + step,
                'lng_min': lng, 'lng_max': lng + step,
                'center_lat': lat + step/2,
                'center_lng': lng + step/2
            })
    logger.info(f"Created grid with {len(grid)} cells")
    return grid

def assign_points_to_grid(df, grid):
    """Gán mỗi điểm trong df vào một ô lưới."""
    if df.empty:
        return defaultdict(int)
    cell_counts = defaultdict(int)
    for _, row in df.iterrows():
        lat = row['lat']
        lng = row['lng']
        for idx, cell in enumerate(grid):
            if (cell['lat_min'] <= lat < cell['lat_max'] and
                cell['lng_min'] <= lng < cell['lng_max']):
                cell_counts[idx] += 1
                break
    return cell_counts

def analyze_patrol_coverage(df_tracks, df_incidents, grid, days_back=7):
    """
    Phân tích:
    - Mật độ tuần tra (số điểm track trên mỗi ô)
    - Mật độ vụ việc (số incident trên mỗi ô)
    - Xác định vùng bỏ trống (ít tuần tra nhưng nhiều vụ việc)
    """
    track_counts = assign_points_to_grid(df_tracks, grid)
    inc_counts = assign_points_to_grid(df_incidents, grid)
    
    result = []
    for idx, cell in enumerate(grid):
        track_density = track_counts.get(idx, 0)
        inc_density = inc_counts.get(idx, 0)
        
        # Phân loại mức độ tuần tra
        if track_density > 10:
            patrol_status = "🟢 Tốt"
        elif track_density > 2:
            patrol_status = "🟡 Trung bình"
        else:
            patrol_status = "🔴 Bỏ trống"
        
        # Phân loại mức độ rủi ro từ vụ việc
        if inc_density > 5:
            risk_level = "🔥 Cao"
        elif inc_density > 1:
            risk_level = "⚠️ Trung bình"
        else:
            risk_level = "✅ Thấp"
        
        # Đề xuất
        if patrol_status == "🔴 Bỏ trống" and risk_level in ["🔥 Cao", "⚠️ Trung bình"]:
            recommendation = "⚠️ Cần tăng cường tuần tra"
        elif patrol_status == "🟡 Trung bình" and risk_level == "🔥 Cao":
            recommendation = "👀 Nên tuần tra thường xuyên hơn"
        else:
            recommendation = "👍 Tiếp tục duy trì"
        
        result.append({
            'cell_id': idx,
            'center_lat': round(cell['center_lat'], 4),
            'center_lng': round(cell['center_lng'], 4),
            'track_count': track_density,
            'incident_count': inc_density,
            'patrol_status': patrol_status,
            'risk_level': risk_level,
            'recommendation': recommendation
        })
    
    df_result = pd.DataFrame(result)
    logger.info(f"Analysis completed, found {len(df_result[df_result['patrol_status'] == '🔴 Bỏ trống'])} empty patrol zones")
    return df_result
