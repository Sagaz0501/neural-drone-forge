"""
LAS NOVEDADES DE LA WEB: CHANGELOG.md -> site/novedades.html (todas las versiones) + la sección corta de index.html
(las 3 últimas, entre <!-- novedades --> y <!-- /novedades -->). Sin dependencias; se puede correr las veces que sea.

    python3 site/novedades.py

La workflow "Página web" lo corre antes de publicar (también cuando cambia CHANGELOG.md o se sube un tag v*).
Cada versión enlaza a su release de GitHub si el tag existe ("v3.1" -> v3.1.0; con git tag, o --tags v3.1.0,v3.0.0).
"""
import html
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SITE = RAIZ / "site"
REPO = "https://github.com/Sagaz0501/neural-drone-forge"
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def tags():
    for a in sys.argv[1:]:
        if a.startswith("--tags"):
            return set(a.split("=", 1)[1].split(","))
    try:
        out = subprocess.run(["git", "tag", "--list", "v*"], cwd=RAIZ, capture_output=True, text=True, timeout=10).stdout
        return set(out.split())
    except (OSError, subprocess.SubprocessError):
        return set()


def inline(txt):
    """Markdown simple -> HTML: `código`, **negrita**, *cursiva*, [texto](url). Los enlaces relativos van a GitHub."""
    partes = re.split(r"(`[^`]+`)", txt)
    out = []
    for p in partes:
        if p.startswith("`") and p.endswith("`") and len(p) > 1:
            out.append(f"<code>{html.escape(p[1:-1])}</code>")
            continue
        p = html.escape(p, quote=False)

        def enlace(m):
            url = m.group(2)
            if not re.match(r"https?://", url):
                url = f"{REPO}/blob/main/{url.lstrip('./')}"
            return f'<a href="{html.escape(url)}" target="_blank" rel="noopener">{m.group(1)}</a>'
        p = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", enlace, p)
        p = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", p)
        p = re.sub(r"(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])", r"<i>\1</i>", p)
        out.append(p)
    return "".join(out)


def leer():
    """[{version, titulo, nota, fecha, bloques: [("h", txt) | ("li", txt) | ("p", txt)]}] en el orden del archivo."""
    vers, v, item = [], None, None
    for linea in (RAIZ / "CHANGELOG.md").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^## (v[\d.]+)\s*·\s*(.+)$", linea)
        if m:
            titulo, nota, fecha = m.group(2).strip(), "", ""
            f = re.search(r"\((\d{1,2})-(\d{1,2})-(\d{4})\)\s*$", titulo)
            if f:
                fecha = (int(f.group(1)), int(f.group(2)), int(f.group(3)))
                titulo = titulo[:f.start()].strip()
            n = re.search(r"\*\((.+?)\)\*\s*$", titulo)
            if n:
                nota, titulo = n.group(1), titulo[:n.start()].strip()
            f2 = re.search(r"\((.+?)\)\s*$", titulo)          # "(octubre de 2026)"
            if f2 and not fecha:
                fecha, titulo = f2.group(1), titulo[:f2.start()].strip()
            v = {"version": m.group(1), "titulo": titulo, "nota": nota, "fecha": fecha, "bloques": []}
            vers.append(v)
            item = None
            continue
        if v is None or linea.startswith("# "):
            continue
        if not linea.strip():
            item = None
            continue
        if linea.startswith("- "):
            item = ["li", linea[2:].strip()]
            v["bloques"].append(item)
        elif linea.startswith("  ") and item:
            item[1] += " " + linea.strip()
        elif re.fullmatch(r"\*\*.+\*\*", linea.strip()):
            v["bloques"].append(["h", linea.strip()[2:-2]])
            item = None
        else:
            item = ["p", linea.strip()]
            v["bloques"].append(item)
    return vers


def tag_de(version):
    p = version[1:].split(".")
    return "v" + ".".join((p + ["0", "0"])[:3])


def fecha_txt(f, en=False):
    if isinstance(f, tuple):
        d, m, a = f
        return f"{MONTHS[m - 1]} {d}, {a}" if en else f"{d} {MESES[m - 1]} {a}"
    return f or ""


def resumen(txt):
    """Lo que dice una viñeta en una línea: su parte en negrita, o el comienzo."""
    m = re.match(r"\*\*(.+?)\*\*", txt)
    if m and not m.group(1).lower().startswith("arreglado"):
        return m.group(1).rstrip(":").strip()
    if m:                                            # "Arreglado:" solo no dice nada: + el comienzo de lo arreglado
        resto = re.sub(r"\*\*|`", "", txt[m.end():]).strip()
        resto = re.split(r"(?<=[.;(])\s|\s\(", resto, maxsplit=1)[0].rstrip(" .;(")
        resto = resto if len(resto) <= 70 else resto[:68].rsplit(" ", 1)[0] + "…"
        return f"**{m.group(1).rstrip(':').strip()}:** {resto[:1].upper()}{resto[1:]}"
    corto = re.split(r"(?<=[.:;])\s", txt, maxsplit=1)[0]
    return corto if len(corto) <= 90 else corto[:88].rsplit(" ", 1)[0] + "…"


def tarjeta(v, i, hay):
    tag = tag_de(v["version"])
    f_es, f_en = fecha_txt(v["fecha"]), fecha_txt(v["fecha"], True)
    fecha = f'<span data-en="{html.escape(f_en)}">{html.escape(f_es)}</span>' if f_es else ""
    nota = f'<span class="nota">{inline(v["nota"])}</span>' if v["nota"] else ""
    nueva = '<span class="nueva" data-en="Latest">La última</span>' if i == 0 else ""
    rel = (f'<a class="rel" href="{REPO}/releases/tag/{tag}" target="_blank" rel="noopener">'
           f'<span data-en="Release on GitHub">Release en GitHub</span> ↗</a>') if tag in hay else ""
    cuerpo, lista = [], []
    for tipo, txt in v["bloques"]:
        if tipo == "li":
            lista.append(f"<li><span>{inline(txt)}</span></li>")
            continue
        if lista:
            cuerpo.append("<ul>" + "".join(lista) + "</ul>")
            lista = []
        cuerpo.append(f"<h4>{inline(txt)}</h4>" if tipo == "h" else f"<p>{inline(txt)}</p>")
    if lista:
        cuerpo.append("<ul>" + "".join(lista) + "</ul>")
    vid = "v" + v["version"][1:].replace(".", "-")
    return (f'<article class="ver rv" id="{vid}">\n'
            f'  <div class="ver-h"><span class="vn">{v["version"]}</span>{nueva}<time>{fecha}</time>{nota}{rel}</div>\n'
            f'  <h3>{inline(v["titulo"])}</h3>\n'
            f'  {"".join(cuerpo)}\n</article>')


CSS = """
.novs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.nov{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:24px;display:flex;flex-direction:column;gap:12px;transition:transform .2s,border-color .2s}
.nov:hover{transform:translateY(-4px);border-color:#3a4652}
.nov-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-family:var(--mono);font-size:12.5px;color:var(--dim)}
.nov-h .vn{color:var(--orange);font-weight:600;font-size:14px}
.nov-h .nueva{color:var(--green);border:1px solid rgba(62,224,138,.4);border-radius:999px;padding:2px 9px}
.nov h3{font-size:21px}
.nov ul{list-style:none;display:grid;gap:7px;font-size:14.5px;color:var(--muted)}
.nov li{display:flex;gap:10px}
.nov li::before{content:"";flex:none;width:6px;height:6px;margin-top:9px;border-radius:2px;background:var(--orange);rotate:45deg}
.nov .mas{margin-top:auto;font-size:14px;color:var(--orange2)}
.nov .mas:hover{color:var(--text)}
.novs-cta{display:flex;justify-content:center;margin-top:36px}
@media (max-width:900px){.novs{grid-template-columns:1fr}}
"""


def seccion(vers, hay):
    tarjetas = []
    for i, v in enumerate(vers[:3]):
        vid = "v" + v["version"][1:].replace(".", "-")
        items = [resumen(t) for k, t in v["bloques"] if k == "li"][:4]
        nueva = '<span class="nueva" data-en="Latest">La última</span>' if i == 0 else ""
        f_es, f_en = fecha_txt(v["fecha"]), fecha_txt(v["fecha"], True)
        fecha = f'<span data-en="{html.escape(f_en)}">{html.escape(f_es)}</span>' if f_es else ""
        tarjetas.append(
            f'    <div class="nov rv">\n'
            f'      <div class="nov-h"><span class="vn">{v["version"]}</span>{nueva}<span>{fecha}</span></div>\n'
            f'      <h3>{inline(v["titulo"])}</h3>\n'
            f'      <ul>{"".join(f"<li><span>{inline(x)}</span></li>" for x in items)}</ul>\n'
            f'      <a class="mas" href="novedades.html#{vid}" data-en="Read more →">Leer todo →</a>\n'
            f'    </div>')
    return (f'<!-- novedades -->\n<style>{CSS}</style>\n'
            f'<section id="novedades">\n  <div class="wrap">\n'
            f'  <div class="sec-head center">\n'
            f'    <span class="eyebrow rv" data-en="Devlog">Diario de desarrollo</span>\n'
            f'    <h2 class="rv" data-en="What\'s new">Novedades</h2>\n'
            f'    <p class="lead rv" data-en="Every release, what changed and why. Release notes are in Spanish.">Cada versión, qué cambió y por qué.</p>\n'
            f'  </div>\n'
            f'  <div class="novs">\n' + "\n".join(tarjetas) + '\n  </div>\n'
            f'  <div class="novs-cta rv"><a class="btn btn-ghost" href="novedades.html" data-en="See every release ({len(vers)})">'
            f'Ver todas las versiones ({len(vers)})</a></div>\n'
            f'  </div>\n</section>\n<!-- /novedades -->')


def estilos_base(index):
    """Lo común de la web (variables, botones, nav, footer, aparecer) sale del <style> de index.html: un solo look."""
    css = re.search(r"<style>(.*?)</style>", index, re.S).group(1)
    corte = css.index("/* hero */")
    fin = css[css.index("footer{"):]
    return css[:corte] + fin


def pagina(vers, hay, index):
    nav = re.search(r'<nav id="nav">.*?</nav>', index, re.S).group(0)
    nav = re.sub(r'href="#(\w*)"', lambda m: f'href="index.html{"#" + m.group(1) if m.group(1) else ""}"', nav)
    nav = nav.replace('<a href="index.html#novedades"', '<a class="on" href="#"')
    footer = re.search(r"<footer>.*?</footer>", index, re.S).group(0).replace('href="#"', 'href="index.html"')
    head = re.search(r"<head>(.*?)<style>", index, re.S).group(1)
    head = re.sub(r"<title>.*?</title>", "<title>Novedades · Neural Drone Forge</title>", head)
    head = head.replace('content="https://sagaz0501.github.io/neural-drone-forge/"',
                        'content="https://sagaz0501.github.io/neural-drone-forge/novedades.html"')
    head = re.sub(r'(<meta name="description" content=")[^"]*', r"\1Todas las versiones de Neural Drone Forge: qué cambió en cada release.", head)
    lista = "\n".join(tarjeta(v, i, hay) for i, v in enumerate(vers))
    indice = "".join(f'<a href="#v{v["version"][1:].replace(".", "-")}">{v["version"]}</a>' for v in vers)
    return f"""<!doctype html>
<!-- GENERADO por site/novedades.py desde CHANGELOG.md: no lo edites a mano -->
<html lang="es">
<head>{head}<style>{estilos_base(index)}
nav .links a.on{{color:var(--text)}}
.top{{padding:150px 0 40px;background:radial-gradient(700px 320px at 50% 0%,rgba(255,122,26,.12),transparent)}}
.top h1{{font-size:clamp(44px,6vw,76px);font-weight:800;margin:14px 0 18px}}
.indice{{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px}}
.indice a{{font-family:var(--mono);font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}}
.indice a:hover{{color:var(--text);border-color:#3a4652}}
.vers{{display:grid;gap:22px;padding:30px 0 110px;max-width:860px}}
.ver{{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:30px 32px;scroll-margin-top:90px}}
.ver-h{{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-family:var(--mono);font-size:13px;color:var(--dim);margin-bottom:10px}}
.ver-h .vn{{color:var(--orange);font-weight:600;font-size:15px}}
.ver-h .nueva{{color:var(--green);border:1px solid rgba(62,224,138,.4);border-radius:999px;padding:2px 10px}}
.ver-h .nota{{font-style:italic}}
.ver-h .rel{{margin-left:auto;color:var(--orange2)}}
.ver-h .rel:hover{{color:var(--text)}}
.ver h3{{font-size:clamp(24px,3vw,32px);font-weight:800;margin-bottom:16px}}
.ver h4{{font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--cyan);margin:18px 0 8px}}
.ver p{{color:var(--muted);margin:8px 0}}
.ver ul{{list-style:none;display:grid;gap:10px}}
.ver li{{display:flex;gap:12px;font-size:15.5px;color:var(--muted)}}
.ver li>span,.ver h3,.ver p{{min-width:0;overflow-wrap:anywhere}}
.ver li::before{{content:"";flex:none;width:7px;height:7px;margin-top:10px;border-radius:2px;background:var(--orange);rotate:45deg}}
.ver b{{color:var(--text);font-weight:600}}
.ver a:not(.rel){{color:var(--cyan)}}
.ver code{{font-family:var(--mono);font-size:.86em;background:#0d1116;border:1px solid var(--line);border-radius:6px;padding:1px 6px;overflow-wrap:anywhere}}
@media (max-width:600px){{.ver{{padding:22px 18px}} .ver-h .rel{{margin-left:0;flex-basis:100%}}}}
</style>
</head>
<body>

{nav}

<header class="top">
  <div class="wrap">
    <span class="eyebrow" data-en="Devlog">Diario de desarrollo</span>
    <h1 data-en="What's new">Novedades</h1>
    <p class="lead" data-en="Every release of Neural Drone Forge, newest first. The notes are in Spanish (the game is made in Spanish first).">Cada versión de Neural Drone Forge, de la más nueva a la primera.</p>
    <div class="indice">{indice}</div>
  </div>
</header>

<main class="wrap"><div class="vers">
{lista}
</div></main>

{footer}

<script>
let lang = "es";
try {{ lang = localStorage.getItem("ndf.lang") || (navigator.language || "es").slice(0, 2); }} catch (e) {{}}
const pedido = new URLSearchParams(location.search).get("lang");
if (pedido) lang = pedido;
if (lang !== "en") lang = "es";
const ES = new Map();
function setLang(l) {{
  lang = l; document.documentElement.lang = l;
  document.querySelectorAll("[data-en]").forEach(el => {{ if (!ES.has(el)) ES.set(el, el.innerHTML); el.innerHTML = l === "en" ? el.dataset.en : ES.get(el); }});
  document.getElementById("lang").innerHTML = l === "en" ? "ES · <b>EN</b>" : "<b>ES</b> · EN";
  try {{ localStorage.setItem("ndf.lang", l); }} catch (e) {{}}
}}
document.getElementById("lang").onclick = () => setLang(lang === "es" ? "en" : "es");
const nav = document.getElementById("nav");
addEventListener("scroll", () => nav.classList.toggle("solid", scrollY > 30), {{ passive: true }});
nav.classList.add("solid");
const io = new IntersectionObserver(es => es.forEach(e => {{ if (e.isIntersecting) {{ e.target.classList.add("in"); io.unobserve(e.target); }} }}), {{ threshold: .05 }});
document.querySelectorAll(".rv").forEach(el => io.observe(el));
setTimeout(() => document.querySelectorAll(".rv").forEach(el => {{ if (el.getBoundingClientRect().top < innerHeight) el.classList.add("in"); }}), 100);
setLang(lang);
</script>
</body>
</html>
"""


def main():
    vers, hay = leer(), tags()
    idx_path = SITE / "index.html"
    index = idx_path.read_text(encoding="utf-8")
    if "<!-- novedades -->" not in index:
        sys.exit("index.html no tiene los marcadores <!-- novedades --> … <!-- /novedades -->")
    nuevo = re.sub(r"<!-- novedades -->.*?<!-- /novedades -->", lambda _: seccion(vers, hay), index, flags=re.S)
    if nuevo != index:
        idx_path.write_text(nuevo, encoding="utf-8")
    (SITE / "novedades.html").write_text(pagina(vers, hay, nuevo), encoding="utf-8")
    print(f"novedades: {len(vers)} versiones ({', '.join(v['version'] for v in vers[:3])}…) · releases con tag: "
          f"{sum(tag_de(v['version']) in hay for v in vers)}")


if __name__ == "__main__":
    main()
