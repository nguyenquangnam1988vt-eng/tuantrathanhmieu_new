import logging
import os
from datetime import datetime
from logging.handlers import RotatingFileHandler

def setup_logger():
    if not os.path.exists("logs"):
        os.makedirs("logs")
    filename = f"logs/system_{datetime.now().strftime('%Y-%m-%d')}.log"
    
    # Tạo handler ghi file, giới hạn 5MB, giữ 3 file backup
    handler = RotatingFileHandler(filename, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(name)s - %(message)s")
    handler.setFormatter(formatter)
    
    # Lấy root logger và thêm handler (tránh thêm nhiều lần)
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    # Nếu đã có handler thì không thêm nữa (tránh trùng)
    if not logger.handlers:
        logger.addHandler(handler)
