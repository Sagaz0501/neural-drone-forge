# PyInstaller: el Python de la app instalada (scripts/lanzador.py + numpy, PyTorch CPU, stable-baselines3, gymnasium).
#   cd desktop && ../.venv/bin/pyinstaller --noconfirm servidor.spec      -> desktop/build/py/servidor/ (una carpeta)
# electron-builder la copia a los recursos de la app (package.json "extraResources"). El código del juego va aparte.
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

RAIZ = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(RAIZ, "scripts", "lanzador.py")],
    pathex=[RAIZ, os.path.join(RAIZ, "scripts")],
    datas=collect_data_files("stable_baselines3") + collect_data_files("gymnasium"),   # (version.txt…)
    hiddenimports=collect_submodules("stable_baselines3") + collect_submodules("gymnasium") + ["http.server", "webbrowser"],
    excludes=["tensorboard", "matplotlib", "pandas", "IPython", "tkinter", "pytest", "PyInstaller", "torch.utils.tensorboard"],
    noarchive=False,
)
pyz = PYZ(a.pure)
# X utf8 = el modo UTF-8 de Python (como `python -X utf8`): en Windows open()/read_text() sin encoding leen cp1252 y los
# acentos de missions.json o modelo.json se rompen. (El código igual pone encoding="utf-8": esto es por si se escapa uno.)
exe = EXE(pyz, a.scripts, [("X utf8", None, "OPTION")], exclude_binaries=True, name="servidor", console=True, strip=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="servidor")
