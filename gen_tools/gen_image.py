import urllib.request, urllib.error, json, base64, sys, os, traceback

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(SCRIPT_DIR, "gen_image.log")

def log(msg):
    print(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")

open(LOG, "w").close()
log("=== gen_image.py start ===")

KEY    = os.environ.get("GAPI_KEY") or "AIzaSyC7umcmAdwscOCeBw8xeytqyABW_FJ9YiQ"
MODEL  = os.environ.get("GAPI_MODEL", "imagen-4.0-fast-generate-001")
PROMPT = os.environ.get("GAPI_PROMPT", "a golden trophy cup for horse racing arcade game, flat design icon, gold color, clean vector style")
OUT    = os.environ.get("GAPI_OUT", os.path.join(SCRIPT_DIR, "test_trophy.png"))

log(f"MODEL : {MODEL}")
log(f"PROMPT: {PROMPT}")
log(f"OUT   : {OUT}")

url  = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:predict?key={KEY}"
body = json.dumps({
    "instances": [{"prompt": PROMPT}],
    "parameters": {"sampleCount": 1}
}).encode()

req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
try:
    log("Sending request...")
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    log(f"Response length: {len(raw)} bytes")
    data = json.loads(raw)
    if "predictions" in data:
        img = base64.b64decode(data["predictions"][0]["bytesBase64Encoded"])
        with open(OUT, "wb") as f:
            f.write(img)
        log(f"OK - saved {OUT} ({len(img)} bytes)")
    else:
        log("API ERROR: " + json.dumps(data, indent=2))
except urllib.error.HTTPError as e:
    log(f"HTTPError {e.code}: {e.read().decode()}")
except Exception as e:
    log("EXCEPTION: " + traceback.format_exc())

log("=== done ===")
