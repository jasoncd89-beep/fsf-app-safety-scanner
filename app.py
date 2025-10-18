import os, json
from collections import OrderedDict
from flask import Flask, request, jsonify, render_template
from openai import OpenAI

SYSTEM_PROMPT = (
    "You are the FSF Safety Engine, speaking in the Future Safe Families brand voice: calm, protective, non-alarmist, parent-first, with leadership energy. Avoid jargon. Use empathetic, direct language suitable for UK parents. Never moralise; emphasise resilience and identity (Family CEO)."
)

USER_PROMPT_TEMPLATE = (
    "Analyse the app/platform: {app_name}.\n"
    "Return JSON with keys: threat_score (int 1–10), risks (array of 3–6 bullets), conversation_script (string), action_checklist (array 4–8 bullets), notes (optional string).\n"
    "Scoring rubric: 1–3 = low risk (with specific caveats), 4–6 = medium (clear conditions, age settings, supervision notes), 7–8 = high (specific high-probability harms/grooming/scam vectors), 9–10 = severe (multiple vectors or systemic dangers).\n"
    "Weigh: hidden contact pathways, AI-generated content risks, location/privacy exposure, deceptive design (dark patterns), monetisation pressures, age verification weakness, addictive mechanics, and realistic parent oversight burden.\n"
    "Tone: clear, non-technical, no fear-mongering. Make the conversation_script a calm, confident parent voice that reinforces the child’s identity and agency, not punishment."
)

app = Flask(__name__)

CACHE_MAX = 50
cache = OrderedDict()

def get_from_cache(key: str):
    k = key.strip().lower()
    if k in cache:
        cache.move_to_end(k)
        return cache[k]
    return None

def set_cache(key: str, value):
    k = key.strip().lower()
    cache[k] = value
    cache.move_to_end(k)
    if len(cache) > CACHE_MAX:
        cache.popitem(last=False)

def call_openai(app_name: str, retry: bool = False):
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": USER_PROMPT_TEMPLATE.format(app_name=app_name)},
    ]
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.4,
    )
    content = resp.choices[0].message.content
    try:
        return json.loads(content)
    except Exception:
        messages.append({"role": "user", "content": "Return ONLY valid JSON."})
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads(resp.choices[0].message.content)

def validate_payload(p: dict):
    for k in ["threat_score","risks","conversation_script","action_checklist"]:
        if k not in p: raise ValueError(f"Missing key: {k}")
    if not isinstance(p["threat_score"], int):
        p["threat_score"] = int(p["threat_score"])
    p["threat_score"] = max(1, min(10, p["threat_score"]))
    if not isinstance(p["risks"], list): raise ValueError("risks must be a list")
    if not isinstance(p["conversation_script"], str): raise ValueError("conversation_script must be a string")
    if not isinstance(p["action_checklist"], list): raise ValueError("action_checklist must be a list")
    if "notes" in p and p["notes"] is not None and not isinstance(p["notes"], str):
        p["notes"] = str(p["notes"])
    return p

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/scan", methods=["POST"])
def scan():
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error":"Invalid JSON body"}), 400

    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error":"Query cannot be empty."}), 400

    cached = get_from_cache(query)
    if cached:
        return jsonify({"app": query, "result": cached})

    try:
        ai_result = validate_payload(call_openai(query, retry=True))
    except Exception:
        return jsonify({"error":"AI_UNAVAILABLE","message":"I couldn’t fetch a summary just now. Please try again."}), 502

    set_cache(query, ai_result)
    return jsonify({"app": query, "result": ai_result})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    app.run(host="0.0.0.0", port=port, debug=True)
