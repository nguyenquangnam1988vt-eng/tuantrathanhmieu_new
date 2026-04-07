# logger.py
import logging
import os
from datetime import datetime, timezone, timedelta
from logging.handlers import RotatingFileHandler

# Múi giờ Việt Nam (UTC+7)
VN_TIMEZONE = timezone(timedelta(hours=7))

class VNTimeFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, tz=VN_TIMEZONE)
        if datefmt:
            return dt.strftime(datefmt)
        else:
            return dt.isoformat()

def setup_logger():
    if not os.path.exists("logs"):
        os.makedirs("logs")
    filename = f"logs/system_{datetime.now(VN_TIMEZONE).strftime('%Y-%m-%d')}.log"
    
    handler = RotatingFileHandler(filename, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
    formatter = VNTimeFormatter("%(asctime)s - %(levelname)s - %(name)s - %(message)s")
    handler.setFormatter(formatter)
    
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        logger.addHandler(handler)

def get_logger(name):
    return logging.getLogger(name)
