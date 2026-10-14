"""
Abre el JUEGO en el navegador, volando con EL modelo (models/modelo.zip).

    python scripts/jugar.py            # o el botón "Jugar en el navegador" de Drone Lab

Qué hace:
  1. si models/modelo.zip es más nuevo que models/modelo_web.json, lo exporta (los pesos en JSON)
  2. levanta un servidor local en http://localhost:8765 (solo tu compu) con la carpeta del proyecto
  3. abre game/ en el navegador
El juego vuelve a leer models/modelo_web.json cada vez que le das "Volar": si estás entrenando en
el laboratorio, vuela con la última generación guardada (se guarda sola cada 10 generaciones).
Ctrl+C para cerrar el servidor.
"""
import argparse
import functools
import http.server
import json
import socket
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


_lock = threading.Lock()


def fresh_web_model(quiet=True):
    with _lock:
        _fresh_web_model(quiet)


def _fresh_web_model(quiet):
    zp = ROOT / "models" / "modelo.zip"
    web = ROOT / "models" / "modelo_web.json"
    if not zp.exists():
        if not quiet:
            print("Todavía no hay models/modelo.zip: entrena en Drone Lab. El juego abre igual (pilotas tú).")
        return
    if web.exists() and web.stat().st_mtime >= zp.stat().st_mtime:
        return
    from export_policy import export, npz_to_web          # necesita PyTorch (el .venv del proyecto)
    npz = export(zp, ROOT / "models" / "modelo.npz")
    meta = {}
    mj = ROOT / "models" / "modelo.json"
    if mj.exists():
        m = json.loads(mj.read_text())
        meta = {k: m.get(k) for k in ("generaciones", "pasos", "niveles", "creado", "actualizado")}
    print("Exportado:", npz_to_web(npz, web, meta))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] == "/models/modelo_web.json":
            try:
                fresh_web_model()        # si el laboratorio guardó una generación nueva, exportarla
            except Exception as e:       # (sin PyTorch, etc.): se sirve el que haya
                print("No pude exportar el modelo:", e, flush=True)
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")         # siempre el modelo más nuevo
        super().end_headers()

    def log_message(self, *a):
        pass


def port_busy(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    fresh_web_model(quiet=False)
    url = f"http://localhost:{a.port}/game/"
    if port_busy(a.port):
        print("El servidor ya estaba abierto:", url)
        if not a.no_browser:
            webbrowser.open(url)
        return
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), functools.partial(Handler, directory=str(ROOT)))
    print("Juego en", url, "(Ctrl+C para cerrar)", flush=True)
    if not a.no_browser:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
