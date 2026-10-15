"""Simular prueba y el Avance del modelo (scripts/simulacion.py): la misma prueba que entrena, grabada para el juego.
Usa la IA publicada (models/publico/modelo_web.json); no entrena nada."""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import simulacion as S  # noqa: E402

WEB = ROOT / "models" / "publico" / "modelo_web.json"


def test_red_web_igual_que_el_juego():
    red = S.RedWeb.cargar(WEB)
    assert red.capas()[0] == 38 and red.capas()[-1] == 4
    a, h = red.act(np.zeros(38))
    assert a.shape == (4,) and np.all(np.abs(a) <= 1) and len(h) == len(red.capas()) - 2


def test_simular_graba_la_prueba(tmp_path):
    (tmp_path / "modelo.json").write_text(json.dumps({"historia": [[1, 100, 0.5, 0.1, 11, 0.4]], "drones": ["estándar"]}))
    rep = S.simular(tmp_path, WEB, "prueba", seed=3)
    assert rep["tipo"] == "prueba" and rep["stage"] == 11 and rep["toma"]["tipo"] in ("fija", "orbita", "revelar")
    n = len(rep["cuadros"]["pos"])
    assert n > 3 and all(len(rep["cuadros"][k]) == n for k in ("rot", "act", "q", "prog", "premio", "meta"))
    assert rep["red"]["capas"][0] == 38 and len(rep["red"]["in"]) == len(rep["red"]["h"]) == len(rep["red"]["mu"])
    assert set(rep["resultado"]) >= {"exito", "choque", "premio", "t"}
    rep2 = S.simular(tmp_path, WEB, "prueba", seed=3)
    assert rep2["cuadros"]["pos"] == rep["cuadros"]["pos"]           # misma semilla = misma prueba
    json.dumps(rep)                                                    # se puede mandar al navegador


def test_config_sigue_el_entrenamiento(tmp_path):
    cfg = S.config_prueba(tmp_path, {"stage": 12, "dron": "al azar", "params": {"wind": 0.8, "density": 1}})
    assert cfg["stage"] == 12 and cfg["dron"] == "al azar" and cfg["wind"] == 0.8
    assert S.cargar_dron("al azar")[1] is not None and S.cargar_dron("estándar") == (None, None)


def test_avance_mejor_y_peor(tmp_path):
    av = S.Avance(tmp_path / "avance.json")
    rep = lambda p: {"stage": 11, "resultado": {"premio": p}}          # noqa: E731
    assert av.candidato(11, 5.0) == "mejor"
    av.guardar("mejor", rep(5.0))
    assert av.candidato(11, 3.0) == "peor"
    av.guardar("peor", rep(3.0))
    assert av.candidato(11, 4.0) is None and av.candidato(11, 9.0) == "mejor" and av.candidato(11, -1.0) == "peor"
    assert S.Avance(tmp_path / "avance.json").candidato(11, 4.0) is None   # lo recuerda al reabrir
    assert av.candidato(12, 0.0) == "mejor"                                  # cada nivel por separado


def test_avance_primero_y_ultimo(tmp_path):
    av = S.Avance(tmp_path / "avance.json")
    assert av.candidatos(11, 1.0, ahora=1000) == ["primero", "mejor", "ultimo"]
    for c in ("primero", "mejor", "ultimo"):
        av.guardar(c, {"stage": 11, "t": 1000, "resultado": {"premio": 1.0}})
    assert av.candidatos(11, 0.5, ahora=1030) == ["peor"]                 # el último se renueva cada minuto
    assert av.candidatos(11, 0.8, ahora=1100) == ["peor", "ultimo"]
    assert "primero" not in av.candidatos(11, 9.0, ahora=1100)             # el primero no se reemplaza nunca
