"""HTTP service for the ultrasound models. The Node server is its only caller.

    python server.py            listens on 127.0.0.1:8790

Environment: ULTRASOUND_HOST (default 127.0.0.1; 0.0.0.0 inside a container), ULTRASOUND_PORT (8790).

  GET  /health   -> {"ok": true, "jugularModels": 4, "heartModel": true}
  POST /jugular  {"image": <base64 PNG or JPEG>, "depthCm": 4}
  POST /heart    {"frames": {"2CH_ED": <base64>, "2CH_ES": ..., "4CH_ED": ..., "4CH_ES": ...}, "depthCm": 16}

Images are analysed in memory and never written to disk or logged.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import inference

MAX_BODY = 24 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "GuardianUltrasound/1"

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, dict(ok=True, jugularModels=STATE["jugular_models"], heartModel=STATE["heart_model"]))
        else:
            self.reply(404, dict(error="not_found"))

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length") or 0)
            if not 0 < length <= MAX_BODY:
                return self.reply(413, dict(error="payload_too_large", message="Request body too large"))
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise inference.BadInput("Malformed request.")
            if self.path == "/jugular":
                if not isinstance(body.get("image"), str):
                    raise inference.BadInput("An image is required.")
                return self.reply(200, inference.jugular(body["image"], body.get("depthCm")))
            if self.path == "/heart":
                return self.reply(200, inference.heart(body.get("frames"), body.get("depthCm")))
            self.reply(404, dict(error="not_found"))
        except inference.BadInput as e:
            self.reply(400, dict(error="bad_input", message=str(e)))
        except json.JSONDecodeError:
            self.reply(400, dict(error="bad_input", message="Malformed request."))
        except Exception as e:  # never echo request content; the class name is enough to find the cause
            print(f"analysis failed: {type(e).__name__}", file=sys.stderr, flush=True)
            self.reply(500, dict(error="analysis_failed", message="The scan could not be analysed."))

    def log_message(self, fmt, *args):  # one line per request: method, path, status
        print(f"{self.command} {self.path.split('?')[0]} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    host, port = os.environ.get("ULTRASOUND_HOST", "127.0.0.1"), int(os.environ.get("ULTRASOUND_PORT", 8790))
    STATE = inference.warm_up()
    print(f"ultrasound service ready on http://{host}:{port} ({STATE['jugular_models']} jugular models, heart model loaded)", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
