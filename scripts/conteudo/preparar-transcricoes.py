#!/usr/bin/env python3
"""
Transforma as transcrições do canal em SQL para o banco `conteudo`.

Formato de origem, uma linha por fala:
    [00:02](https://youtu.be/ID?t=2)(https://youtu.be/ID?t=2) texto falado

Cada linha já traz o SEGUNDO e o LINK DIRETO — então o trecho guardado aponta
o momento exato, não o vídeo inteiro. É a diferença entre "essa aula fala
sobre isso" e "ele fala sobre isso aos 4:32".

Agrupa falas em trechos de ~45 segundos: linha solta é curta demais para
casar com pergunta, e transcrição inteira é grande demais para localizar.
"""
import os, re, sys, glob

BASE = os.path.expanduser('~/Desktop/prints/Audio Transcrição')
FONTES = [
    ('aula',    'Aulas Dr. Turí - Audio Transcrição'),
    ('podcast', 'Podcast Dr. Turí - AudioTranscrição'),
    ('receita', 'Receitas Dr. Turí - Audio Transcrição'),
]
LINHA = re.compile(r'^\[(\d+):(\d+)(?::(\d+))?\]\((https?://[^)]+)\)')
JANELA = 45          # segundos por trecho
MIN_CHARS = 120      # trecho menor que isso não vale busca

def segundos(m):
    a, b, c = m.group(1), m.group(2), m.group(3)
    return int(a)*3600 + int(b)*60 + int(c) if c else int(a)*60 + int(b)

def esc(t):
    return t.replace("'", "''")

def trechos_de(caminho):
    with open(caminho, encoding='utf-8', errors='replace') as f:
        linhas = f.readlines()
    url_base, atual, inicio, saida = None, [], None, []
    for ln in linhas:
        m = LINHA.match(ln.strip())
        if not m:
            continue
        seg = segundos(m)
        if url_base is None:
            url_base = m.group(4).split('?')[0]
        texto = LINHA.sub('', ln.strip())
        texto = re.sub(r'^\(https?://[^)]+\)', '', texto).strip()
        if inicio is None:
            inicio = seg
        atual.append(texto)
        if seg - inicio >= JANELA:
            junto = ' '.join(atual).strip()
            if len(junto) >= MIN_CHARS:
                saida.append((inicio, junto))
            atual, inicio = [], None
    if atual:
        junto = ' '.join(atual).strip()
        if len(junto) >= MIN_CHARS:
            saida.append((inicio or 0, junto))
    return url_base, saida

linhas_sql, total, videos = [], 0, 0
for tipo, pasta in FONTES:
    for caminho in sorted(glob.glob(os.path.join(BASE, pasta, '*.txt'))):
        titulo = os.path.splitext(os.path.basename(caminho))[0]
        url, trechos = trechos_de(caminho)
        if not url or not trechos:
            print(f'  IGNORADO (sem link ou sem trecho): {titulo}', file=sys.stderr)
            continue
        videos += 1
        for inicio, texto in trechos:
            total += 1
            linhas_sql.append(
                f"('{tipo}','{esc(titulo)}','{url}',{inicio},'{esc(texto)}')")

print(f"-- {videos} vídeos, {total} trechos", file=sys.stderr)
print("BEGIN;")
print("TRUNCATE public.aulas_trecho;")
LOTE = 500
for i in range(0, len(linhas_sql), LOTE):
    print("INSERT INTO public.aulas_trecho (tipo, titulo, url, inicio_seg, texto) VALUES")
    print(',\n'.join(linhas_sql[i:i+LOTE]) + ';')
print("COMMIT;")
