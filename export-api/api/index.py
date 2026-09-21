"""Standalone Flask app, deployed as its own Vercel project (Python runtime).

This service does exactly one thing: assemble held (fileId, slideIndex)
picks from Drive decks into a single exported .pptx (pptx_builder.py). It's
kept as Python specifically to reuse the already-tested slide-copy logic,
which has no good equivalent library on the Node/Next.js side. Everything
else in the app (search, thumbnails, admin, the DB) lives in the Next.js
app - this service is deliberately as small as possible.

Deployed at its own Vercel domain; vercel.json rewrites every path here so
Flask's own router (not Vercel's) decides between /health and /export.

Called server-to-server only, from web/app/api/export/route.ts (the browser
never talks to this service directly and never sees the Google access
token), so there's no browser CORS concern to configure here.
"""
import io

from flask import Flask, jsonify, request, send_file

import pptx_builder

app = Flask(__name__)


def _extract_access_token():
    header = request.headers.get("X-Google-Access-Token") or request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        header = header[len("Bearer "):]
    return header or None


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.post("/export")
def export():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify(error="missing X-Google-Access-Token header"), 401

    body = request.get_json(silent=True) or {}
    items = body.get("items") or []
    if not items:
        return jsonify(error="items must be a non-empty list of {fileId, slideIndex}"), 400

    try:
        pptx_bytes = pptx_builder.build_export(access_token, items)
    except NotImplementedError as exc:
        return jsonify(error=str(exc)), 422

    return send_file(
        io.BytesIO(pptx_bytes),
        mimetype="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        as_attachment=True,
        download_name="script.pptx",
    )
