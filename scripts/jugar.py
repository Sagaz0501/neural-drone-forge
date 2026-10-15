"""
Abre DRON MAKER en el navegador (app/), con EL modelo (models/modelo.zip) para el piloto IA.

    python scripts/jugar.py            # el juego: taller, pedidos, misiones   -> /app/
    python scripts/jugar.py --arena    # la arena del modelo: aros y caza      -> /game/ (botón "Jugar" de Drone Lab)

Qué hace:
  1. si models/modelo.zip es más nuevo que models/modelo_web.json, lo exporta (los pesos en JSON)
  2. levanta un servidor local en http://localhost:8765 (solo tu compu) con la carpeta del proyecto
  3. abre el juego en el navegador
El juego vuelve a leer models/modelo_web.json cada vez que le das "Volar": si estás entrenando en
el laboratorio, vuela con la última generación guardada (se guarda sola cada 10 generaciones).

Laboratorio de IA (pantalla del juego) <-> Blender, a través de este servidor:
  POST /api/lab            pedido de entrenamiento -> models/lab_pedido.json (y el dron -> drones/<nombre>.json);
                           responde {"ok", "msg", "id"}: cuando Blender lo lee, lab_estado.json trae "pedido" = ese id
  GET  /api/lab            lo que dicen Blender (models/lab_estado.json: estado esperando|iniciando|entrenando|
                           deteniendo|error, último error, pedido) y el entrenador (models/entrenando.json)
  POST /api/abrir_blender  abre blender/laboratorio.blend con el Drone Lab cargado
  POST /api/partida        copia de la partida del navegador en partida.json (para revisarla desde afuera)

UN MODELO POR DRON (el hangar): models/drones/<slug>/ tiene modelo.zip, modelo.json, modelo_web.json (+ entrenando.json
y entrenando.log si entrena en el fondo). slug = [a-z0-9_-], 1-40, sin "_" al inicio. "base" = models/modelo.zip etc.
  POST /api/lab  además acepta:
      "modelo": slug (def. "base")
      "base_de": "base" | "cero" | <slug>   solo si la carpeta aún no tiene modelo.zip (al "iniciar"): copia
                 models/modelo.zip(+json+web) o el de ese dron; "cero" = red nueva. Nunca toca el original.
      "donde": "blender" (def.: lab_pedido.json, ahora con "modelo": <ruta del zip>, "modelo_slug")
               | "fondo": este servidor lanza live_train.py sin Blender (--speed rapido, puertos UDP libres de
                 DRONMAKER_FONDO_PORTS="9031,9032;9041,9042"; máx. 2, uno por modelo; log en entrenando.log).
                 pausar ("pausa": bool opcional; si no, alterna) / detener (guarda) / ajustar (premios, viento,
                 velocidad) van por el puerto de control. "iniciar" con otro nivel/dron/n.º de drones = detener,
                 guardar y relanzar.
      "lr", "ent": tasa de aprendizaje y exploración (al lanzar en el fondo y en vivo; en Blender en vivo por UDP)
      "capas": [64, 64] la red de un modelo NUEVO (base_de "cero"): queda en info.json y live_train la usa al crearla
      "accion": "guardar" = guarda ya (fondo o Blender)
      responde {"ok", "msg", "id"} (+ "modelo", "donde", "pid" en el fondo)
  GET  /api/lab  además: "fondo": [{modelo, activo, pid, puertos, pausado, ...entrenando.json}], "blender_modelo"
  GET  /api/red?modelo=<slug>  la red del dron que mira su entrenamiento (activaciones "in"/"h"/"mu"/"act", "capas",
                     "w" = conexiones más fuertes por capa [origen, destino, peso], "i" = qué dron, "n" = cuántos);
                     {"ok": false} si no entrena. "watch": i en POST /api/lab (iniciar/ajustar) cambia el dron que mira
  GET  /api/modelos  {"modelos": [{slug, nombre, tiene_modelo, gen, pasos, tomas, niveles, rango_fisica, drones,
                     creado, actualizado, base_de, entrenando: bool, donde: "blender"|"fondo"|null, web}]}
  GET  /models/drones/<slug>/modelo_web.json   se re-exporta solo si su modelo.zip es más nuevo (como el base)
  POST /api/modelo {"accion": "renombrar", "slug", "nuevo"?: slug nuevo (mueve la carpeta), "nombre"?: texto}
                   {"accion": "copiar", "slug" (o "base"), "nuevo", "nombre"?}
                   {"accion": "borrar", "slug"}  -> models/drones/_papelera/<slug>_<fecha> (nunca se borra de verdad)
                   "base" no se renombra ni se borra; nada se renombra/borra mientras entrena.

STL del jugador (piezas importadas): stl/<id>.stl + stl/index.json [{id, nombre, tipo, bytes, creado}]
  POST /api/stl?nombre=<texto>&tipo=chasis|canopy|controladora|camara|bateria|otro   cuerpo = bytes del STL
       (binario o ASCII, máx. 25 MB) -> {"ok", "id", "url": "/stl/<id>.stl"}
  GET  /api/stl          -> {"stl": [...índice...]}
  POST /api/stl_borrar   {"id"} -> stl/_papelera/ (y fuera del índice)
  GET  /stl/<id>.stl     el archivo (estático)
Ctrl+C para cerrar el servidor (los entrenamientos del fondo siguen; al volver a abrirlo los encuentra).
"""
import argparse
import functools
import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


_lock = threading.Lock()


def fresh_web_model(quiet=True, folder=None):
    """Si el modelo.zip de la carpeta (por defecto models/, el "base") es más nuevo que su modelo_web.json, lo exporta."""
    with _lock:
        _fresh_web_model(quiet, Path(folder) if folder else ROOT / "models")


def _fresh_web_model(quiet, folder):
    zp = folder / "modelo.zip"
    web = folder / "modelo_web.json"
    if not zp.exists():
        if not quiet:
            print("Todavía no hay models/modelo.zip: entrena en Drone Lab. El juego abre igual (pilotas tú).")
        return
    if web.exists() and web.stat().st_mtime >= zp.stat().st_mtime:
        return
    from export_policy import export, npz_to_web          # necesita PyTorch (el .venv del proyecto)
    npz = export(zp, folder / "modelo.npz")
    meta = {}
    mj = folder / "modelo.json"
    if mj.exists():
        m = json.loads(mj.read_text())
        meta = {k: m.get(k) for k in ("generaciones", "pasos", "niveles", "creado", "actualizado",
                                      "rango_fisica", "tomas", "drones")}
    print("Exportado:", npz_to_web(npz, web, meta))


BLENDER = os.environ.get("BLENDER", "/Applications/Blender.app/Contents/MacOS/Blender")
REWARD_KEYS = ("progress", "goal", "crash", "time", "smooth", "tilt", "near", "clearance", "danger", "speed",
               "stability", "heading", "film")
FIS_KEYS = ("mass", "twr", "drag", "max_angle_deg", "yaw_rate_deg", "att_resp", "crash_speed", "radius")


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_json(path, obj):
    tmp = path.with_name(path.stem + "_guardando.json")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def other_trainers():
    """Entrenamientos de OTRA carpeta (ej. ~/Documents/drone-rl): ocupan el puerto del Drone Lab."""
    try:
        out = subprocess.run(["ps", "-axww", "-o", "command="], capture_output=True, text=True, timeout=2).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    res = []
    for line in out.splitlines():
        if "live_train.py" not in line or str(ROOT / "scripts") in line:
            continue
        m = re.search(r"(\S+)/scripts/live_train\.py", line)
        st = re.search(r"--stage (\d+)", line)
        res.append({"carpeta": m.group(1).replace(str(Path.home()), "~") if m else "?", "nivel": int(st.group(1)) if st else None})
    return res


def lab_state(fondo=True):
    now = time.time()
    lab = read_json(ROOT / "models" / "lab_estado.json") or {}
    tr = read_json(ROOT / "models" / "entrenando.json") or {}
    out = {"blender": dict(lab, abierto=now - float(lab.get("vivo", 0)) < 4.0),
           "entrenador": dict(tr, activo=bool(tr) and now - float(tr.get("t", 0)) < 6.0 and tr.get("phase") != "stopped"),
           "otros": other_trainers(), "ahora": now}
    out["blender_modelo"] = lab.get("modelo") or tr.get("modelo") or "base"
    out["entrenador"].setdefault("modelo", out["blender_modelo"])
    if fondo:
        out["fondo"] = fondo_state(now)
    return out


def lab_request(body):
    """Valida el pedido del juego y lo deja para Blender (o lo corre en el fondo). Devuelve (ok, mensaje)."""
    lab_request.extra = {}
    acc = body.get("accion")
    if acc not in ("iniciar", "ajustar", "pausar", "detener", "guardar"):
        return False, "acción desconocida"
    slug = check_slug(body.get("modelo") or "base")
    donde = body.get("donde") or "blender"
    if donde not in ("blender", "fondo"):
        return False, "donde: blender o fondo"
    req = {"id": time.time_ns(), "t": time.time(), "accion": acc, "python": sys.executable}
    if "nivel" in body:
        req["nivel"] = int(body["nivel"])
        niveles = [k for k in json.loads((ROOT / "drone_rl" / "missions.json").read_text()) if k.isdigit()]
        if str(req["nivel"]) not in niveles:      # los niveles que existen salen de missions.json (12, 13… sin tocar esto)
            return False, f"nivel {req['nivel']} no existe"
    if "drones" in body:
        req["drones"] = max(1, min(200, int(body["drones"])))
    if body.get("velocidad") in ("real", "rapido"):
        req["velocidad"] = body["velocidad"]
    if "viento" in body:
        req["viento"] = max(0.0, min(8.0, float(body["viento"])))
    if isinstance(body.get("premios"), dict):
        req["premios"] = {k: max(0.0, min(100.0, float(v))) for k, v in body["premios"].items() if k in REWARD_KEYS}
    if "lr" in body:                             # tasa de aprendizaje (el estudio PBDMM)
        req["lr"] = max(1e-6, min(1e-2, float(body["lr"])))
    if "watch" in body:                          # qué dron mira (su red neuronal se ve en el juego y en Blender)
        req["watch"] = max(0, min(199, int(body["watch"])))
    if "ent" in body:                            # exploración extra (coeficiente de entropía)
        req["ent"] = max(0.0, min(0.1, float(body["ent"])))
    capas = body.get("capas")
    if capas is not None:                        # la red de un modelo NUEVO: [64, 64] … (1-4 capas de 8-512)
        if not (isinstance(capas, list) and 1 <= len(capas) <= 4 and all(isinstance(c, int) and 8 <= c <= 512 for c in capas)):
            return False, "capas: de 1 a 4 números entre 8 y 512"
    d = body.get("dron")
    if d in ("ESTANDAR", "AZAR"):
        req["dron"] = d
    elif isinstance(d, dict):                    # el dron del jugador: su física -> drones/<nombre>.json
        nombre = re.sub(r"[^a-z0-9_]+", "_", str(d.get("nombre", "mi_dron")).lower()).strip("_")[:40] or "mi_dron"
        fis = d.get("fisica") or {}
        try:
            fis = {k: float(fis[k]) for k in FIS_KEYS}
        except (KeyError, TypeError, ValueError):
            return False, "la física del dron está incompleta"
        if not (1.0 < fis["twr"] < 20 and 0.05 < fis["mass"] < 10):
            return False, "física del dron fuera de rango"
        out = {"nombre": nombre, "piezas": d.get("piezas", {}), "fisica": fis, "juego": d.get("juego", {})}
        (ROOT / "drones").mkdir(exist_ok=True)
        write_json(ROOT / "drones" / f"{nombre}.json", out)
        req["dron"] = nombre
    lab_request.extra = {"modelo": slug, "donde": donde}
    if acc == "iniciar":
        with _fondo_lock:
            otro = training_where(slug)
            if otro and otro != donde:
                return False, f"el modelo {slug} ya está entrenando en {'Blender' if otro == 'blender' else 'el fondo'}"
            if donde == "fondo":
                if slug == "base":
                    return False, "el modelo base se entrena en Blender (elige el modelo de un dron)"
                vivos = fondo_procs()
                if slug not in vivos and len(vivos) >= MAX_FONDO:
                    return False, f"ya hay {MAX_FONDO} entrenamientos en el fondo: detén uno"
            lab_request.extra["modelo_txt"] = ensure_model(slug, body.get("base_de", "base"), capas)
    if donde == "fondo":
        if slug == "base":
            return False, "el modelo base se entrena en Blender (elige el modelo de un dron)"
        ok, msg, extra = fondo_request(slug, acc, req, body)
        lab_request.extra.update(extra)
        lab_request.last_id = req["id"]
        return ok, msg
    if "modelo" in body and acc != "iniciar":
        b, corriendo = blender_model()
        if corriendo and b != slug:
            return False, f"Blender está entrenando otro modelo ({b})"
    req["modelo"] = str(model_zip(slug))
    req["modelo_slug"] = slug
    if acc == "guardar":                         # Blender no tiene ese pedido: directo al entrenador
        b, corriendo = blender_model()
        if not (corriendo and b == slug):
            return False, f"{slug} no está entrenando en Blender"
        send_ctrl(blender_ctrl_port(), {"save": True})
        return True, "guardando el modelo…"
    if acc == "ajustar" and any(k in req for k in ("lr", "ent", "watch")):
        b, corriendo = blender_model()
        if corriendo and b == slug:              # al entrenador de Blender, por su puerto de control
            send_ctrl(blender_ctrl_port(), {k: req[k] for k in ("lr", "ent", "watch") if k in req})
    write_json(ROOT / "models" / "lab_pedido.json", req)
    lab_request.last_id = req["id"]
    return True, "pedido enviado a Blender"


# ======================================================================
# Un modelo por dron: models/drones/<slug>/ (modelo.zip, modelo.json, modelo_web.json, entrenando.json/.log)
# "base" = los archivos de siempre en models/ (models/modelo.zip …)
# ======================================================================
SLUG_RE = re.compile(r"[a-z0-9][a-z0-9_-]{0,39}")     # sin "_" al inicio: _papelera es nuestra
MODEL_FILES = ("modelo.zip", "modelo.json", "modelo_web.json")


def check_slug(slug, allow_base=True):
    """Valida un slug de modelo. Devuelve el slug o lanza ValueError."""
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        raise ValueError(f"modelo inválido: {slug!r} (a-z, 0-9, _ y -, máx. 40)")
    if slug == "base" and not allow_base:
        raise ValueError("el modelo base no se puede cambiar así")
    return slug


def drones_dir():
    return ROOT / "models" / "drones"


def model_dir(slug):
    return ROOT / "models" if slug == "base" else drones_dir() / check_slug(slug)


def model_zip(slug):
    return model_dir(slug) / "modelo.zip"


def read_info(slug):
    return read_json(model_dir(slug) / "info.json") or {}


def write_info(slug, **kw):
    if slug == "base":
        return
    info = dict(read_info(slug), **kw)
    write_json(model_dir(slug) / "info.json", info)


def ensure_model(slug, base_de="base", capas=None):
    """La carpeta del dron con su modelo. Si aún no tiene modelo.zip, copia el de base_de ("base", otro slug) o
    la deja vacía ("cero": el entrenador crea una red nueva). Nunca modifica el original. Devuelve un texto."""
    if slug == "base":
        return "modelo base"
    d = model_dir(slug)
    if (d / "modelo.zip").exists():
        return "continúa su modelo"
    base_de = base_de or "base"
    if base_de != "cero":
        check_slug(base_de)
        if base_de == slug:
            raise ValueError("un modelo no puede partir de sí mismo")
    d.mkdir(parents=True, exist_ok=True)
    txt = "red nueva (desde cero)"
    if base_de != "cero":
        src = model_dir(base_de)
        if (src / "modelo.zip").exists():
            for f in MODEL_FILES:                # copy2 conserva la fecha: el _web sigue "al día" con su zip
                if (src / f).exists():
                    tmp = d / (f + ".copiando")
                    shutil.copy2(src / f, tmp)
                    os.replace(tmp, d / f)
            txt = f"copia del modelo {base_de}"
        else:
            txt = f"{base_de} no tiene modelo: red nueva"
    extra = {"capas": capas} if capas and not (d / "modelo.zip").exists() else {}     # solo una red nueva usa capas
    write_info(slug, base_de=base_de, creado=time.strftime("%Y-%m-%d %H:%M"), **extra)   # live_train lee "capas" al crear la red
    return txt + (f" {capas}" if extra else "")


def blender_model(state=None):
    """Qué modelo entrena Blender ahora (slug) y si está entrenando."""
    st = state or lab_state(fondo=False)
    lab, tr = st["blender"], st["entrenador"]
    slug = lab.get("modelo") or tr.get("modelo") or "base"
    corriendo = bool(lab.get("abierto") and lab.get("corriendo")) or bool(tr.get("activo"))
    return slug, corriendo


def training_where(slug, state=None):
    """'blender', 'fondo' o None."""
    if slug in fondo_procs():
        return "fondo"
    b, corriendo = blender_model(state)
    return "blender" if corriendo and b == slug else None


def red_vivo(slug):
    """La red neuronal del dron que mira el entrenador de ese modelo (activaciones + conexiones más fuertes), de
    <estado>_red.json: el del fondo (models/drones/<slug>/entrenando_red.json) o el de Blender (models/entrenando_red.json)."""
    if slug in fondo_procs():
        p = model_dir(slug) / "entrenando_red.json"
    else:
        b, corriendo = blender_model()
        if not (corriendo and b == slug):
            return None
        p = ROOT / "models" / "entrenando_red.json"
    red = read_json(p)
    if not red or time.time() - float(red.get("t", 0)) > 30:      # viejo: ese entrenamiento ya no escribe
        return None
    return red


def list_models():
    st = lab_state(fondo=False)
    fondo = fondo_procs()
    bslug, bcorre = blender_model(st)
    slugs = ["base"]
    if drones_dir().is_dir():
        slugs += sorted(p.name for p in drones_dir().iterdir() if p.is_dir() and SLUG_RE.fullmatch(p.name)
                        and p.name != "base")
    out = []
    for slug in slugs:
        d = model_dir(slug)
        m = read_json(d / "modelo.json") or {}
        info = read_info(slug)
        donde = "fondo" if slug in fondo else "blender" if (bcorre and bslug == slug) else None
        zp = d / "modelo.zip"
        out.append({"slug": slug, "nombre": info.get("nombre") or ("Modelo base" if slug == "base" else slug),
                    "tiene_modelo": zp.exists(), "gen": m.get("generaciones", 0), "pasos": m.get("pasos", 0),
                    "tomas": m.get("tomas", []), "niveles": m.get("niveles", {}), "drones": m.get("drones", []),
                    "rango_fisica": m.get("rango_fisica"), "creado": m.get("creado"),
                    "actualizado": m.get("actualizado"), "base_de": info.get("base_de"),
                    "entrenando": donde is not None, "donde": donde, "red": m.get("red"),
                    "ultimo": (m.get("historia") or [None])[-1],      # [gen, pasos, éxito, choque, nivel, calidad]
                    "mejor_exito": max((h[2] for h in m.get("historia") or [] if len(h) > 2), default=None),
                    "web": ("/models/modelo_web.json" if slug == "base" else f"/models/drones/{slug}/modelo_web.json")})
    return out


def model_request(body):
    """POST /api/modelo: renombrar · copiar · borrar (a la papelera). Devuelve (ok, msg, extra)."""
    acc = body.get("accion")
    slug = check_slug(body.get("slug"))
    if not model_dir(slug).is_dir() or (slug == "base" and not model_zip("base").exists() and acc == "copiar"):
        return False, f"no existe el modelo {slug}", {}
    nombre = str(body["nombre"]).strip()[:60] if body.get("nombre") else None
    if acc == "copiar":
        nuevo = check_slug(body.get("nuevo"), allow_base=False)
        dst = model_dir(nuevo)
        if dst.exists():
            return False, f"ya existe {nuevo}", {}
        tmp = drones_dir() / f"_copiando_{nuevo}"
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True)
        for f in MODEL_FILES:
            if (model_dir(slug) / f).exists():
                shutil.copy2(model_dir(slug) / f, tmp / f)
        os.replace(tmp, dst)
        write_info(nuevo, base_de=slug, creado=time.strftime("%Y-%m-%d %H:%M"), nombre=nombre or nuevo)
        return True, f"copiado {slug} -> {nuevo}", {"slug": nuevo}
    if acc not in ("renombrar", "borrar"):
        return False, "acción desconocida", {}
    if slug == "base":
        return False, "el modelo base no se renombra ni se borra", {}
    with _fondo_lock:
        if training_where(slug):
            return False, f"{slug} está entrenando: detenlo primero", {}
        if acc == "borrar":
            pap = drones_dir() / "_papelera"
            pap.mkdir(parents=True, exist_ok=True)
            dst = pap / f"{slug}_{time.strftime('%Y%m%d_%H%M%S')}"
            os.replace(model_dir(slug), dst)
            return True, f"{slug} a la papelera", {"papelera": str(dst.relative_to(ROOT))}
        nuevo = body.get("nuevo")
        if nuevo and nuevo != slug:
            check_slug(nuevo, allow_base=False)
            if model_dir(nuevo).exists():
                return False, f"ya existe {nuevo}", {}
            os.replace(model_dir(slug), model_dir(nuevo))
            slug = nuevo
        if nombre:
            write_info(slug, nombre=nombre)
        return True, "listo", {"slug": slug}


# ---------------- entrenar en el fondo (sin Blender) ----------------
_fondo = {}                       # slug -> {"proc", "pid", "ctrl", "port", "cfg"}: los que lanzó este servidor
_fondo_lock = threading.RLock()
MAX_FONDO = 2


def fondo_ports():
    """Pares (telemetría, control) para los entrenadores del fondo. DRONMAKER_FONDO_PORTS="9031,9032;9041,9042"."""
    env = os.environ.get("DRONMAKER_FONDO_PORTS")
    if env:
        return [tuple(int(x) for x in par.split(",")) for par in env.split(";") if par.strip()]
    return [(9031, 9032), (9041, 9042), (9051, 9052), (9061, 9062)]


def udp_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _arg(parts, name):
    return parts[parts.index(name) + 1] if name in parts and parts.index(name) + 1 < len(parts) else None


def fondo_procs():
    """Los entrenadores del fondo vivos: los que lanzó este servidor y los de antes (se buscan con ps por --estado
    dentro de models/drones/), así sobreviven a cerrar y abrir jugar.py. slug -> {pid, ctrl, port, cfg}."""
    with _fondo_lock:
        for slug, f in list(_fondo.items()):
            if f["proc"].poll() is not None:        # terminó (y así no queda zombi)
                _fondo.pop(slug)
        res = {slug: {k: f[k] for k in ("pid", "ctrl", "port", "cfg")} for slug, f in _fondo.items()}
    script = str(ROOT / "scripts" / "live_train.py")
    ddir = str(drones_dir())
    try:
        out = subprocess.run(["ps", "-axww", "-o", "pid=,stat=,command="], capture_output=True, text=True,
                             timeout=2).stdout
    except (OSError, subprocess.SubprocessError):
        return res
    for line in out.splitlines():
        if script not in line or "--estado" not in line:
            continue
        parts = line.split()
        if len(parts) < 3 or parts[1].startswith("Z"):
            continue
        model = _arg(parts, "--model") or ""
        if not model.startswith(ddir + os.sep):
            continue
        slug = Path(model).parent.name
        if slug in res:
            continue
        dron = _arg(parts, "--dron")
        dron = "ESTANDAR" if not dron else "AZAR" if dron == "azar" else Path(dron).stem
        try:
            res[slug] = {"pid": int(parts[0]), "ctrl": int(_arg(parts, "--ctrl-port")), "port": int(_arg(parts, "--port")),
                         "cfg": (int(_arg(parts, "--stage") or 0), dron, int(_arg(parts, "--drones") or 50))}
        except (TypeError, ValueError):
            pass
    return res


def blender_ctrl_port():
    """El puerto de control del entrenador que lanza Blender (como drone_lab.py: DRONMAKER_LAB_PORTS)."""
    return int(os.environ.get("DRONMAKER_LAB_PORTS", "9011,9012").split(",")[1])


def send_ctrl(port, msg):
    """Un mensaje de control (JSON, como los de Blender) al entrenador que escucha en ese puerto UDP."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.sendto(json.dumps(msg).encode(), ("127.0.0.1", port))


def fondo_cfg(req):
    """Lo que obliga a reiniciar si cambia: (nivel, dron, n.º de drones)."""
    return int(req.get("nivel") or 0), req.get("dron") or "ESTANDAR", int(req.get("drones") or 50)


def fondo_cmd(slug, req, port, ctrl):
    d = model_dir(slug)
    py = ROOT / ".venv" / "bin" / "python"
    cmd = [str(py) if py.exists() else sys.executable, "-u", str(ROOT / "scripts" / "live_train.py"),
           "--model", str(d / "modelo.zip"), "--estado", str(d / "entrenando.json"), "--speed", "rapido",
           "--stage", str(req.get("nivel", 0)), "--drones", str(req.get("drones", 50)),
           "--port", str(port), "--ctrl-port", str(ctrl)]
    if req.get("premios"):
        cmd += ["--reward", json.dumps(req["premios"], separators=(",", ":"))]
    if "viento" in req:
        cmd += ["--wind", repr(req["viento"])]
    if "lr" in req:
        cmd += ["--lr", repr(req["lr"])]
    if "ent" in req:
        cmd += ["--ent", repr(req["ent"])]
    dron = req.get("dron")
    if dron == "AZAR":
        cmd += ["--dron", "azar"]
    elif dron and dron != "ESTANDAR":
        cmd += ["--dron", str(ROOT / "drones" / f"{dron}.json")]
    return cmd


def fondo_start(slug, req):
    """Lanza live_train.py sin Blender para ese modelo. Devuelve (ok, msg, pid)."""
    vivos = fondo_procs()
    if slug in vivos:
        return False, f"{slug} ya entrena en el fondo", vivos[slug]["pid"]
    if len(vivos) >= MAX_FONDO:
        return False, f"ya hay {MAX_FONDO} entrenamientos en el fondo: detén uno", None
    usados = {p for f in vivos.values() for p in (f["port"], f["ctrl"])}
    par = next(((a, b) for a, b in fondo_ports() if a not in usados and b not in usados and udp_free(b) and udp_free(a)),
               None)
    if par is None:
        return False, "no hay puertos UDP libres para entrenar en el fondo", None
    d = model_dir(slug)
    d.mkdir(parents=True, exist_ok=True)
    cmd = fondo_cmd(slug, req, *par)
    log = open(d / "entrenando.log", "w")
    proc = subprocess.Popen(cmd, cwd=str(ROOT), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    log.close()
    cfg = fondo_cfg(req)
    _fondo[slug] = {"proc": proc, "pid": proc.pid, "port": par[0], "ctrl": par[1], "cfg": cfg}
    return True, f"entrenando {slug} en el fondo (puertos {par[0]}/{par[1]})", proc.pid


def _restart_later(slug, req, pid):
    """Cambio de nivel/dron: esperar a que el anterior guarde y salga, y relanzar."""
    t0 = time.time()
    while time.time() - t0 < 300:
        try:
            os.kill(pid, 0)
        except OSError:
            break
        with _fondo_lock:
            f = _fondo.get(slug)
            if f and f["pid"] == pid and f["proc"].poll() is not None:
                break
        time.sleep(0.5)
    with _fondo_lock:
        fondo_procs()
        ok, msg, _ = fondo_start(slug, req)
        if not ok:
            print("Fondo:", msg, flush=True)


def fondo_live(req):
    """Lo que se cambia en vivo (como Blender): premios, viento, velocidad."""
    msg = {}
    if req.get("premios"):
        msg["reward"] = req["premios"]
    if "viento" in req:
        msg["env"] = {"wind": req["viento"]}
    if req.get("velocidad"):
        msg["speed"] = req["velocidad"]
    for k in ("lr", "ent", "watch"):
        if k in req:
            msg[k] = req[k]
    return msg


def fondo_request(slug, acc, req, body):
    """POST /api/lab con "donde": "fondo". Devuelve (ok, msg, extra)."""
    with _fondo_lock:
        vivos = fondo_procs()
        f = vivos.get(slug)
        if acc == "iniciar":
            if f is None:
                ok, msg, pid = fondo_start(slug, req)
                return ok, msg, {"pid": pid}
            if f["cfg"] is not None and fondo_cfg(req) != f["cfg"]:
                send_ctrl(f["ctrl"], {"stop": True})        # guarda y sale; después se relanza con lo nuevo
                threading.Thread(target=_restart_later, args=(slug, req, f["pid"]), daemon=True).start()
                return True, "cambio de misión o de dron: guardando y reiniciando…", {"pid": f["pid"]}
            live = fondo_live(req)
            if live:
                send_ctrl(f["ctrl"], live)
            return True, "ya estaba entrenando: premios actualizados", {"pid": f["pid"]}
        if f is None:
            return False, f"{slug} no está entrenando en el fondo", {}
        if acc == "detener":
            send_ctrl(f["ctrl"], {"stop": True})
            return True, "deteniendo y guardando el modelo…", {"pid": f["pid"]}
        if acc == "guardar":
            send_ctrl(f["ctrl"], {"save": True})
            return True, "guardando el modelo…", {"pid": f["pid"]}
        if acc == "pausar":
            if "pausa" in body:
                pausa = bool(body["pausa"])
            else:
                tr = read_json(model_dir(slug) / "entrenando.json") or {}
                pausa = not (tr.get("params") or {}).get("paused", False)
            send_ctrl(f["ctrl"], {"pause": pausa})
            return True, "en pausa" if pausa else "sigue entrenando", {"pid": f["pid"], "pausa": pausa}
        live = fondo_live(req)                               # ajustar
        if live:
            send_ctrl(f["ctrl"], live)
        return True, "premios actualizados", {"pid": f["pid"]}


def fondo_state(now=None):
    now = now or time.time()
    vivos = fondo_procs()
    out = []
    slugs = set(vivos)
    if drones_dir().is_dir():                # también los que terminaron (último progreso), para mostrar "detenido"
        slugs |= {p.parent.name for p in drones_dir().glob("*/entrenando.json") if SLUG_RE.fullmatch(p.parent.name)}
    for slug in sorted(slugs):
        tr = read_json(model_dir(slug) / "entrenando.json") or {}
        f = vivos.get(slug)
        out.append(dict(tr, modelo=slug, activo=f is not None, pid=f["pid"] if f else None,
                        puertos=[f["port"], f["ctrl"]] if f else None,
                        pausado=bool((tr.get("params") or {}).get("paused")) if f else False,
                        al_dia=bool(tr) and now - float(tr.get("t", 0)) < 6.0))
    return out


# ---------------- STL del jugador ----------------
STL_TIPOS = ("chasis", "canopy", "controladora", "camara", "bateria", "otro")
STL_MAX = 25 * 1024 * 1024
_stl_lock = threading.Lock()


def stl_dir():
    return ROOT / "stl"


def stl_index():
    idx = read_json(stl_dir() / "index.json")
    return idx if isinstance(idx, list) else []


def stl_save(data, nombre, tipo):
    """Guarda un STL (binario o ASCII). Devuelve (ok, msg, extra)."""
    if tipo not in STL_TIPOS:
        return False, f"tipo inválido (uno de {', '.join(STL_TIPOS)})", {}
    if not data:
        return False, "el archivo está vacío", {}
    if len(data) > STL_MAX:
        return False, "el STL pasa de 25 MB", {}
    ascii_ok = data[:5].lower() == b"solid" and b"facet" in data[:4096]
    bin_ok = len(data) >= 84 and 84 + 50 * int.from_bytes(data[80:84], "little") == len(data)
    if not (ascii_ok or bin_ok):
        return False, "no parece un STL (ni binario ni ASCII)", {}
    nombre = (nombre or "pieza").strip()[:80] or "pieza"
    base = re.sub(r"[^a-z0-9]+", "_", nombre.lower()).strip("_")[:30] or "pieza"
    with _stl_lock:
        stl_dir().mkdir(exist_ok=True)
        idx = stl_index()
        sid = f"{base}_{os.urandom(3).hex()}"
        while (stl_dir() / f"{sid}.stl").exists():
            sid = f"{base}_{os.urandom(3).hex()}"
        tmp = stl_dir() / f"{sid}.stl.guardando"
        tmp.write_bytes(data)
        os.replace(tmp, stl_dir() / f"{sid}.stl")
        idx.append({"id": sid, "nombre": nombre, "tipo": tipo, "bytes": len(data), "creado": time.strftime("%Y-%m-%d %H:%M:%S")})
        write_json(stl_dir() / "index.json", idx)
    return True, "guardado", {"id": sid, "url": f"/stl/{sid}.stl"}


def stl_delete(sid):
    if not isinstance(sid, str) or not re.fullmatch(r"[a-z0-9_]{1,40}", sid):
        return False, "id inválido"
    with _stl_lock:
        idx = stl_index()
        if not any(e.get("id") == sid for e in idx) and not (stl_dir() / f"{sid}.stl").exists():
            return False, "no existe"
        f = stl_dir() / f"{sid}.stl"
        if f.exists():
            pap = stl_dir() / "_papelera"
            pap.mkdir(exist_ok=True)
            os.replace(f, pap / f"{sid}.stl")
        write_json(stl_dir() / "index.json", [e for e in idx if e.get("id") != sid])
    return True, "a la papelera"


def open_blender():
    if lab_state()["blender"]["abierto"]:
        return True, "Blender ya está abierto"
    if not os.path.isfile(BLENDER):
        return False, f"No encuentro Blender en {BLENDER}"
    env = dict(os.environ, DRONMAKER_ROOT=str(ROOT))
    subprocess.Popen([BLENDER, str(ROOT / "blender" / "laboratorio.blend"), "--python", str(ROOT / "blender" / "drone_lab.py")],
                     cwd=str(ROOT), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return True, "Abriendo Blender…"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{".stl": "model/stl"})

    def send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = self.path.split("?")[0]
        n = int(self.headers.get("Content-Length") or 0)
        if path == "/api/stl":                       # el cuerpo es el STL tal cual (no JSON)
            if n > STL_MAX:
                return self.send_json({"ok": False, "msg": "el STL pasa de 25 MB"}, 413)
            q = parse_qs(urlparse(self.path).query)
            try:
                ok, msg, extra = stl_save(self.rfile.read(n), q.get("nombre", ["pieza"])[0], q.get("tipo", ["otro"])[0])
            except OSError as e:
                ok, msg, extra = False, str(e), {}
            return self.send_json(dict({"ok": ok, "msg": msg}, **extra), 200 if ok else 400)
        if n > 500_000:
            return self.send_json({"ok": False, "msg": "muy grande"}, 413)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self.send_json({"ok": False, "msg": "JSON inválido"}, 400)
        try:
            if path == "/api/lab":
                lab_request.last_id = None
                ok, msg = lab_request(body)
                return self.send_json(dict(getattr(lab_request, "extra", {}) or {}, ok=ok, msg=msg,
                                           id=lab_request.last_id), 200 if ok else 400)
            elif path == "/api/modelo":
                ok, msg, extra = model_request(body)
                return self.send_json(dict(extra, ok=ok, msg=msg), 200 if ok else 400)
            elif path == "/api/stl_borrar":
                ok, msg = stl_delete(body.get("id"))
            elif path == "/api/abrir_blender":
                ok, msg = open_blender()
            elif path == "/api/partida":
                write_json(ROOT / "partida.json", body)
                ok, msg = True, "guardada"
            else:
                return self.send_json({"ok": False, "msg": "no existe"}, 404)
        except (ValueError, TypeError, OSError) as e:
            ok, msg = False, str(e)
        self.send_json({"ok": ok, "msg": msg}, 200 if ok else 400)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/lab":
            return self.send_json(lab_state())
        if path == "/api/modelos":
            return self.send_json({"modelos": list_models()})
        if path == "/api/stl":
            return self.send_json({"stl": stl_index()})
        if path == "/api/red":
            q = parse_qs(urlparse(self.path).query)
            try:
                red = red_vivo(check_slug((q.get("modelo") or ["base"])[0]))
            except ValueError as e:
                return self.send_json({"ok": False, "msg": str(e)}, 400)
            return self.send_json(dict(red, ok=True) if red else {"ok": False, "msg": "ese modelo no está entrenando"})
        m = re.fullmatch(r"/models/drones/([a-z0-9][a-z0-9_-]{0,39})/modelo_web\.json", path)
        if path == "/models/modelo_web.json" or m:
            try:                         # si el laboratorio guardó una generación nueva, exportarla
                fresh_web_model(folder=model_dir(m.group(1)) if m else None)
            except Exception as e:       # (sin PyTorch, etc.): se sirve el que haya
                print("No pude exportar el modelo:", e, flush=True)
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")         # siempre el modelo más nuevo
        super().end_headers()

    def log_message(self, *a):
        pass


def modelo_inicial():
    """Un clon nuevo del repo no trae models/modelo.zip (vive en tu máquina y cambia al entrenar): copia la IA
    publicada (models/publico/) para que el juego tenga con qué volar. Si ya tienes la tuya, no hace nada."""
    m, pub = ROOT / "models", ROOT / "models" / "publico"
    if (m / "modelo.zip").exists() or not (pub / "modelo.zip").exists():
        return
    for f in MODEL_FILES:
        if (pub / f).exists():
            shutil.copy2(pub / f, m / f)
    print("Primera vez: copié la IA publicada (models/publico/) a models/modelo.zip", flush=True)


def port_busy(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--arena", action="store_true", help="abrir la arena del modelo (game/) en vez del juego (app/)")
    a = ap.parse_args()
    modelo_inicial()
    fresh_web_model(quiet=False)
    url = f"http://localhost:{a.port}/{'game' if a.arena else 'app'}/"
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
