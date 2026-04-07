import base64
import math
import requests

def get_base64(file_path):
    try:
        with open(file_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except FileNotFoundError:
        return ""

def haversine(lat1, lng1, lat2, lng2):
    R = 6371e3
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    a = math.sin(delta_phi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def is_valid_coordinate(lat, lng):
    if lat is None or lng is None:
        return False
    try:
        lat = float(lat)
        lng = float(lng)
        if lat == 0 and lng == 0:
            return False
        if lat < 8 or lat > 24 or lng < 102 or lng > 110:
            return False
        return True
    except:
        return False

def upload_to_imgbb(image_file, api_key):
    try:
        url = "https://api.imgbb.com/1/upload"
        payload = {"key": api_key, "expiration": 86400}
        files = {"image": (image_file.name, image_file.getvalue(), image_file.type)}
        response = requests.post(url, data=payload, files=files)
        data = response.json()
        if data.get("success"):
            return data["data"]["url"], None
        return None, data.get("error", {}).get("message", "Lỗi không xác định")
    except Exception as e:
        return None, str(e)