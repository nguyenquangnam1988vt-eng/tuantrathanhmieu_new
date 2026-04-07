import streamlit as st
import pyrebase

def init_firebase():
    firebase_config = dict(st.secrets["firebase"])
    return pyrebase.initialize_app(firebase_config)

def get_firebase_config():
    return dict(st.secrets["firebase"])

def get_imgbb_api_key():
    return st.secrets["imgbb"]["api_key"]

def get_fcm_server_key():
    return st.secrets.get("fcm", {}).get("server_key", "")

def get_fcm_vapid_key():
    return st.secrets.get("fcm", {}).get("vapid_key", "")

def get_cookie_key():
    return st.secrets["auth"]["cookie_key"]