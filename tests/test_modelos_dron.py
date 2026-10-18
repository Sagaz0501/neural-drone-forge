"""Un modelo por dron (models/drones/<slug>/) y los STL del jugador: la parte de scripts/jugar.py.
Todo en carpetas temporales (ROOT cambiado): no toca models/ de verdad ni entrena nada."""
import json
import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import jugar  # noqa: E402


@pytest.fixture
def root(tmp_path, monkeypatch):
    m = tmp_path / "models"
    m.mkdir()
    (m / "modelo.zip").write_bytes(b"ZIP-BASE")
    (m / "modelo.json").write_text(json.dumps({"generaciones": 7, "pasos": 1234, "tomas": ["orbita"],
                                               "niveles": {"grabar": 1000}, "actualizado": "2026-10-14 10:00"}))
    (m / "modelo_web.json").write_text("{}")
    monkeypatch.setattr(jugar, "ROOT", tmp_path)
    monkeypatch.setattr(jugar, "other_trainers", lambda: [])
    monkeypatch.setattr(jugar, "fondo_procs", lambda: {})
    return tmp_path


@pytest.mark.parametrize("slug", ["base", "madera", "dron_2", "a-b", "x" * 40, "0abc"])
def test_slug_ok(slug):
    assert jugar.check_slug(slug) == slug


@pytest.mark.parametrize("slug", ["", "Madera", "../x", "a/b", "x" * 41, "_papelera", "-a", "ñandú", None, 3])
def test_slug_malo(slug):
    with pytest.raises(ValueError):
        jugar.check_slug(slug)


def test_base_es_models(root):
    assert jugar.model_zip("base") == root / "models" / "modelo.zip"
    assert jugar.model_zip("madera") == root / "models" / "drones" / "madera" / "modelo.zip"


def test_base_de_base_copia_sin_tocar_el_original(root):
    antes = (root / "models" / "modelo.zip").stat().st_mtime
    txt = jugar.ensure_model("madera", "base")
    d = root / "models" / "drones" / "madera"
    assert "copia" in txt
    assert (d / "modelo.zip").read_bytes() == b"ZIP-BASE"
    assert json.loads((d / "modelo.json").read_text())["generaciones"] == 7
    assert (d / "modelo_web.json").exists()
    assert (root / "models" / "modelo.zip").read_bytes() == b"ZIP-BASE"
    assert (root / "models" / "modelo.zip").stat().st_mtime == antes
    assert jugar.read_info("madera")["base_de"] == "base"


def test_base_de_cero_y_otro_dron(root):
    jugar.ensure_model("vacio", "cero")
    assert (root / "models" / "drones" / "vacio").is_dir()
    assert not (root / "models" / "drones" / "vacio" / "modelo.zip").exists()
    jugar.ensure_model("madera", "base")
    (root / "models" / "drones" / "madera" / "modelo.zip").write_bytes(b"ZIP-MADERA")
    jugar.ensure_model("hijo", "madera")
    assert (root / "models" / "drones" / "hijo" / "modelo.zip").read_bytes() == b"ZIP-MADERA"


def test_base_de_solo_si_no_hay_modelo(root):
    d = root / "models" / "drones" / "madera"
    d.mkdir(parents=True)
    (d / "modelo.zip").write_bytes(b"MIO")
    assert jugar.ensure_model("madera", "base") == "continúa su modelo"
    assert (d / "modelo.zip").read_bytes() == b"MIO"


def test_base_de_invalido(root):
    with pytest.raises(ValueError):
        jugar.ensure_model("madera", "../../etc")
    with pytest.raises(ValueError):
        jugar.ensure_model("madera", "madera")


def test_lista_modelos(root):
    jugar.ensure_model("madera", "base")
    jugar.ensure_model("vacio", "cero")
    (root / "models" / "drones" / "_papelera" / "viejo").mkdir(parents=True)
    ms = {m["slug"]: m for m in jugar.list_models()}
    assert set(ms) == {"base", "madera", "vacio"}
    assert ms["base"]["gen"] == 7 and ms["base"]["pasos"] == 1234 and ms["base"]["tiene_modelo"]
    assert ms["madera"]["gen"] == 7 and ms["madera"]["base_de"] == "base"
    assert ms["madera"]["web"] == "/models/drones/madera/modelo_web.json"
    assert not ms["vacio"]["tiene_modelo"] and ms["vacio"]["gen"] == 0
    assert not any(m["entrenando"] for m in ms.values())


def test_lista_marca_el_que_entrena(root, monkeypatch):
    jugar.ensure_model("madera", "base")
    monkeypatch.setattr(jugar, "fondo_procs", lambda: {"madera": {"pid": 1, "ctrl": 1, "port": 1, "cfg": None}})
    ms = {m["slug"]: m for m in jugar.list_models()}
    assert ms["madera"]["entrenando"] and ms["madera"]["donde"] == "fondo"
    ok, msg, _ = jugar.model_request({"accion": "borrar", "slug": "madera"})
    assert not ok and "entrenando" in msg


def test_renombrar_copiar_borrar(root):
    jugar.ensure_model("madera", "base")
    ok, _, ex = jugar.model_request({"accion": "renombrar", "slug": "madera", "nuevo": "pino", "nombre": "El pino"})
    assert ok and ex["slug"] == "pino" and not (root / "models" / "drones" / "madera").exists()
    assert jugar.read_info("pino")["nombre"] == "El pino"
    ok, _, _ = jugar.model_request({"accion": "copiar", "slug": "base", "nuevo": "otro"})
    assert ok and (root / "models" / "drones" / "otro" / "modelo.zip").read_bytes() == b"ZIP-BASE"
    assert not jugar.model_request({"accion": "copiar", "slug": "base", "nuevo": "otro"})[0]
    assert not jugar.model_request({"accion": "borrar", "slug": "base"})[0]
    ok, _, ex = jugar.model_request({"accion": "borrar", "slug": "pino"})
    assert ok and not (root / "models" / "drones" / "pino").exists()
    assert (root / ex["papelera"] / "modelo.zip").exists()           # a la papelera, no se borra
    assert {m["slug"] for m in jugar.list_models()} == {"base", "otro"}


def test_pedido_blender_con_modelo(root):
    (root / "drone_rl").mkdir()
    (root / "drone_rl" / "missions.json").write_text(json.dumps({"11": {}, "0": {}}))
    ok, msg = jugar.lab_request({"accion": "iniciar", "nivel": 11, "modelo": "madera", "base_de": "base"})
    assert ok, msg
    ped = json.loads((root / "models" / "lab_pedido.json").read_text())
    assert ped["modelo"] == str(root / "models" / "drones" / "madera" / "modelo.zip")
    assert ped["modelo_slug"] == "madera"
    assert (root / "models" / "drones" / "madera" / "modelo.zip").exists()
    ok, _ = jugar.lab_request({"accion": "iniciar", "nivel": 11})
    assert json.loads((root / "models" / "lab_pedido.json").read_text())["modelo"] == str(root / "models" / "modelo.zip")
    with pytest.raises(ValueError):
        jugar.lab_request({"accion": "iniciar", "nivel": 11, "modelo": "Malo"})
    assert not jugar.lab_request({"accion": "iniciar", "nivel": 11, "donde": "fondo"})[0]   # base: solo Blender


def test_fondo_comando(root):
    cmd = jugar.fondo_cmd("madera", {"nivel": 11, "drones": 8, "dron": "AZAR", "viento": 2.5,
                                     "premios": {"crash": 20.0}}, 9031, 9032)
    d = root / "models" / "drones" / "madera"
    s = " ".join(cmd)
    assert f"--model {d / 'modelo.zip'}" in s and f"--estado {d / 'entrenando.json'}" in s
    assert "--speed rapido" in s and "--stage 11" in s and "--drones 8" in s and "--dron azar" in s
    assert "--port 9031" in s and "--ctrl-port 9032" in s and '{"crash":20.0}' in s


def test_estudio_lr_ent_capas(root):
    """El estudio PBDMM: lr y exploración (al lanzar y en vivo), capas de una red nueva -> info.json."""
    (root / "drone_rl").mkdir()
    (root / "drone_rl" / "missions.json").write_text(json.dumps({"0": {}, "11": {}}))
    ok, msg = jugar.lab_request({"accion": "iniciar", "nivel": 0, "modelo": "colibri", "base_de": "cero",
                                 "capas": [64, 32], "lr": 0.0001, "ent": 0.005})
    assert ok, msg
    info = json.loads((root / "models" / "drones" / "colibri" / "info.json").read_text())
    assert info["capas"] == [64, 32] and info["base_de"] == "cero"
    ped = json.loads((root / "models" / "lab_pedido.json").read_text())
    assert ped["lr"] == 0.0001 and ped["ent"] == 0.005
    s = " ".join(jugar.fondo_cmd("colibri", {"nivel": 0, "lr": 0.0001, "ent": 0.005}, 9031, 9032))
    assert "--lr 0.0001" in s and "--ent 0.005" in s
    assert jugar.fondo_live({"lr": 0.0002, "premios": {"crash": 5.0}}) == {"reward": {"crash": 5.0}, "lr": 0.0002}
    # capas solo para una red nueva (una copia de la base no cambia de tamaño)
    jugar.lab_request({"accion": "iniciar", "nivel": 0, "modelo": "copia", "base_de": "base", "capas": [16]})
    assert "capas" not in json.loads((root / "models" / "drones" / "copia" / "info.json").read_text())
    for malo in ([4], [64] * 5, "64,64", [64.5]):
        assert not jugar.lab_request({"accion": "iniciar", "nivel": 0, "modelo": "x2", "base_de": "cero", "capas": malo})[0]
    assert jugar.lab_request({"accion": "iniciar", "nivel": 0, "modelo": "x3", "lr": 5})[0]   # se recorta, no falla
    assert json.loads((root / "models" / "lab_pedido.json").read_text())["lr"] == 0.01


def test_live_train_capas(tmp_path):
    import live_train
    args = type("A", (), {"capas": None, "net": 128})()
    zp = tmp_path / "modelo.zip"
    assert live_train.capas_red(args, zp) == [128, 128]
    (tmp_path / "info.json").write_text(json.dumps({"capas": [32, 16, 8]}))
    assert live_train.capas_red(args, zp) == [32, 16, 8]
    args.capas = "64,64"
    assert live_train.capas_red(args, zp) == [64, 64]


def _stl_bin(n=2):
    return b"\0" * 80 + struct.pack("<I", n) + b"\0" * (50 * n)


def test_stl_subir_listar_borrar(root):
    ok, msg, ex = jugar.stl_save(_stl_bin(), "Mi Chasis 3D", "chasis")
    assert ok, msg
    assert ex["url"] == f"/stl/{ex['id']}.stl" and ex["id"].startswith("mi_chasis_3d_")
    assert (root / "stl" / f"{ex['id']}.stl").read_bytes() == _stl_bin()
    ok2, _, ex2 = jugar.stl_save(b"solid x\n facet normal 0 0 1\n endsolid x\n", "tapa", "canopy")
    assert ok2
    idx = jugar.stl_index()
    assert [e["id"] for e in idx] == [ex["id"], ex2["id"]] and idx[0]["tipo"] == "chasis" and idx[0]["bytes"] == 184
    assert not jugar.stl_save(b"hola", "x", "chasis")[0]           # no es STL
    assert not jugar.stl_save(_stl_bin(), "x", "cohete")[0]         # tipo inválido
    ok, _ = jugar.stl_delete(ex["id"])
    assert ok and not (root / "stl" / f"{ex['id']}.stl").exists()
    assert (root / "stl" / "_papelera" / f"{ex['id']}.stl").exists()
    assert [e["id"] for e in jugar.stl_index()] == [ex2["id"]]
    assert not jugar.stl_delete("../index")[0]


def test_modelo_inicial_clon_nuevo(tmp_path, monkeypatch):
    """Un clon del repo sin models/modelo.zip toma la IA publicada; si ya hay una, no la toca."""
    monkeypatch.setattr(jugar, "ROOT", tmp_path)
    pub = tmp_path / "models" / "publico"
    pub.mkdir(parents=True)
    (pub / "modelo.zip").write_bytes(b"PUB")
    (pub / "modelo.json").write_text("{}")
    jugar.modelo_inicial()
    assert (tmp_path / "models" / "modelo.zip").read_bytes() == b"PUB"
    (tmp_path / "models" / "modelo.zip").write_bytes(b"MIO")
    jugar.modelo_inicial()
    assert (tmp_path / "models" / "modelo.zip").read_bytes() == b"MIO"


def test_red_vivo_y_watch(root, monkeypatch):
    """GET /api/red: la red del dron que mira el entrenamiento del fondo; watch va en vivo al entrenador."""
    import time as _t
    d = root / "models" / "drones" / "halcon"
    d.mkdir(parents=True)
    monkeypatch.setattr(jugar, "fondo_procs", lambda: {"halcon": {"pid": 1, "ctrl": 9032, "port": 9031}})
    assert jugar.red_vivo("halcon") is None                       # todavía no escribe
    (d / "entrenando_red.json").write_text(json.dumps({"t": _t.time(), "i": 7, "n": 50, "capas": [38, 64, 64, 4]}))
    assert jugar.red_vivo("halcon")["i"] == 7
    (d / "entrenando_red.json").write_text(json.dumps({"t": _t.time() - 60, "i": 7}))
    assert jugar.red_vivo("halcon") is None                       # viejo
    assert jugar.red_vivo("otro") is None
    assert jugar.fondo_live({"watch": 17}) == {"watch": 17}


def test_api_simular_y_avance(root, monkeypatch):
    import shutil
    d = root / "models" / "drones" / "halcon"
    d.mkdir(parents=True)
    shutil.copy(Path(__file__).resolve().parents[1] / "models" / "publico" / "modelo_web.json", d / "modelo_web.json")
    monkeypatch.setattr(jugar, "fresh_web_model", lambda **kw: None)
    rep, msg = jugar.simular_prueba("halcon")
    assert rep and rep["modelo"] == "halcon" and rep["cuadros"]["pos"], msg
    assert jugar.simular_prueba("nadie")[0] is None


def test_recientes_por_nivel():
    """El tutorial mide el éxito de la foto (nivel 13) con las últimas generaciones de ese nivel."""
    hist = [[g, 100, 0.1 * (g % 10), 0, 13 if g > 5 else 11, 0] for g in range(1, 30)]
    r = jugar.recientes_por_nivel(hist, n=4)
    assert set(r) == {"11", "13"}
    assert [x[0] for x in r["13"]] == [26, 27, 28, 29] and len(r["11"]) == 4
    assert jugar.recientes_por_nivel([[1, 2, 0.5]]) == {}


def test_reservados_no_se_tocan(root, monkeypatch):
    monkeypatch.delenv("DRONMAKER_INTERNO", raising=False)
    (root / "drone_rl").mkdir()
    (root / "drone_rl" / "missions.json").write_text(json.dumps({"16": {}}))
    jugar.ensure_model("corredor", "base")
    assert {m["slug"]: m for m in jugar.list_models()}["corredor"]["reservado"]
    assert not jugar.lab_request({"accion": "iniciar", "nivel": 16, "modelo": "corredor", "donde": "fondo"})[0]
    assert not jugar.lab_request({"accion": "iniciar", "nivel": 16, "modelo": "mio", "base_de": "corredor"})[0]
    for body in ({"accion": "copiar", "slug": "corredor", "nuevo": "mio"}, {"accion": "borrar", "slug": "corredor"},
                 {"accion": "renombrar", "slug": "corredor", "nuevo": "x"}, {"accion": "copiar", "slug": "base", "nuevo": "cazador"}):
        assert not jugar.model_request(body)[0]
    monkeypatch.setenv("DRONMAKER_INTERNO", "1")                      # Santiago sí los entrena
    assert jugar.lab_request({"accion": "iniciar", "nivel": 16, "modelo": "corredor"})[0]
