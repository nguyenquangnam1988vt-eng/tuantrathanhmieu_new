# services/hotspot_service.py
import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN
from datetime import datetime, timedelta
import logging
from services.firebase_service import init_db
from utils.helpers import is_valid_coordinate

logger = logging.getLogger(__name__)

def get_incident_data(days_back=30):
    """
    Lấy dữ liệu sự cố (incidents) từ Firebase trong khoảng thời gian gần đây.
    Trả về DataFrame với các cột: lat, lng, timestamp
    """
    db = init_db()
    incidents = db.child("incidents").get().val()
    if not incidents:
        logger.warning("No incident data found")
        return pd.DataFrame(columns=['lat', 'lng', 'timestamp'])
    
    data = []
    now = datetime.now()
    cutoff = now - timedelta(days=days_back)
    
    for key, inc in incidents.items():
        if not isinstance(inc, dict):
            continue
        ts = inc.get("timestamp")
        if not ts:
            continue
        dt = datetime.fromtimestamp(ts/1000)
        if dt < cutoff:
            continue
        lat = inc.get("lat")
        lng = inc.get("lng")
        if is_valid_coordinate(lat, lng):
            data.append({
                'lat': lat,
                'lng': lng,
                'timestamp': ts
            })
    
    df = pd.DataFrame(data)
    logger.info(f"Loaded {len(df)} incident points for hotspot analysis")
    return df

def detect_hotspots(df, eps_km=1.0, min_samples=3):
    """
    Phát hiện các cụm điểm nóng bằng DBSCAN.
    - df: DataFrame có cột 'lat', 'lng'
    - eps_km: bán kính cụm (km)
    - min_samples: số điểm tối thiểu để tạo cụm
    Trả về: DataFrame gốc có thêm cột 'cluster', và thông tin cụm.
    """
    if df.empty:
        return df, []
    
    coords = df[['lng', 'lat']].values
    coords_rad = np.radians(coords)
    eps_rad = eps_km / 6371.0
    
    db = DBSCAN(eps=eps_rad, min_samples=min_samples, algorithm='ball_tree', metric='haversine')
    clusters = db.fit_predict(coords_rad)
    
    df = df.copy()
    df['cluster'] = clusters
    
    cluster_info = []
    unique_clusters = set(clusters)
    for cid in unique_clusters:
        if cid == -1:
            continue
        cluster_points = df[df['cluster'] == cid]
        center_lat = cluster_points['lat'].mean()
        center_lng = cluster_points['lng'].mean()
        size = len(cluster_points)
        distances = np.sqrt((cluster_points['lat'] - center_lat)**2 + (cluster_points['lng'] - center_lng)**2)
        radius_km = distances.mean() * 111  # 1 độ ≈ 111 km
        cluster_info.append({
            'cluster_id': int(cid),
            'center_lat': center_lat,
            'center_lng': center_lng,
            'size': size,
            'radius_km': radius_km,
            'points': cluster_points[['lat', 'lng']].to_dict('records')
        })
    
    logger.info(f"Detected {len(cluster_info)} hotspots")
    return df, cluster_info

def save_hotspot_log(cluster_info, days_back):
    """Lưu kết quả phân tích điểm nóng lên Firebase"""
    db = init_db()
    log_entry = {
        'timestamp': datetime.now().timestamp() * 1000,
        'days_back': days_back,
        'clusters': cluster_info,
        'total_clusters': len(cluster_info)
    }
    db.child('hotspot_logs').push(log_entry)
    logger.info("Hotspot analysis saved to Firebase")
