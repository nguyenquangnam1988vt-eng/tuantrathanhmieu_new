import logging
import os
from datetime import datetime

def setup_logger():
    if not os.path.exists("logs"):
        os.makedirs("logs")

    filename = f"logs/system_{datetime.now().strftime('%Y-%m-%d')}.log"

    logging.basicConfig(
        filename=filename,
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
        encoding="utf-8"
    )

def get_logger(name):
    return logging.getLogger(name)
