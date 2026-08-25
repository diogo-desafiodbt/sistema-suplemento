#!/usr/bin/env python3
"""
Abastece o histórico de desenvolvimento.

Existe porque a primeira versão só gravava o deploy do sistema — e o gráfico
da tela é feito de LINHAS MEXIDAS, que vêm dos commits. Sem ingerir commit,
a curva pararia de crescer no dia em que foi criada, e ninguém perceberia
até olhar o gráfico um mês depois e ver uma reta.

Varre os quatro repositórios, pega o que ainda não está no banco e insere.
É idempotente: o índice único absorve o que já entrou, então rodar de novo
não duplica. Como a data gravada é a do COMMIT, não a da ingestão, a linha
do tempo continua certa mesmo se rodar dias depois.

Uso: python3 scripts/registrar-historia.py [--deploy]
     --deploy também registra a publicação que está acontecendo agora.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPOS = {
    'lp-primeiro-passo': os.path.expanduser('~/LP-PRIMEIRO-PASSO'),
    'sistema-suplemento': RAIZ,
    'site': os.path.expanduser('~/Desktop/SITE-DESAFIODIABETES'),
    'blog': os.path.expanduser('~/Desktop/BLOG-DESAFIODIABETES'),
}
SEP = '\x1f'


def sql(texto: str) -> str:
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as f:
        f.write(texto)
        caminho = f.name
    r = subprocess.run([f'{RAIZ}/scripts/rodar-sql.sh', 'clinico', caminho],
                       capture_output=True, text=True, cwd=RAIZ)
    os.unlink(caminho)
    return r.stdout


def ultimo_commit(projeto: str) -> str | None:
    saida = sql("\\pset pager off\n"
                f"SELECT to_char(max(quando),'YYYY-MM-DD\"T\"HH24:MI:SS') "
                f"FROM dev_evento WHERE tipo='commit' AND projeto='{projeto}';\n")
    m = re.search(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', saida)
    return m.group(0) if m else None


def esc(v) -> str:
    if v is None or v == '':
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def commits_novos(projeto: str, caminho: str) -> list[str]:
    if not os.path.isdir(os.path.join(caminho, '.git')):
        return []
    desde = ultimo_commit(projeto)
    cmd = ['git', '-C', caminho, 'log', '--no-merges',
           f'--pretty=format:{SEP.join(["%H", "%aI", "%an", "%s"])}', '--shortstat']
    if desde:
        # `--since` é inclusivo no segundo, então o último já gravado pode
        # voltar. O índice único descarta — mais seguro que arriscar pular um.
        cmd.insert(4, f'--since={desde}')
    r = subprocess.run(cmd, capture_output=True, text=True)
    linhas, i, valores = r.stdout.split('\n'), 0, []
    while i < len(linhas):
        if SEP in linhas[i]:
            sha, quando, autor, titulo = linhas[i].split(SEP, 3)
            arq = ins = dele = 0
            if i + 1 < len(linhas) and 'changed' in linhas[i + 1]:
                st = linhas[i + 1]
                g = lambda p: int(m.group(1)) if (m := re.search(p, st)) else 0
                arq, ins, dele = g(r'(\d+) files? changed'), g(r'(\d+) insertions?'), g(r'(\d+) deletions?')
                i += 1
            valores.append(
                f"('commit','git',{esc(projeto)},{esc(quando)},{esc(titulo[:300])},"
                f"{esc(sha[:10])},{esc(autor)},NULL,NULL,{arq},{ins},{dele})")
        i += 1
    return valores


def main() -> int:
    valores = []
    for projeto, caminho in REPOS.items():
        novos = commits_novos(projeto, caminho)
        if novos:
            print(f'  {projeto}: {len(novos)} commit(s) novo(s)')
        valores += novos

    if '--deploy' in sys.argv:
        sha = subprocess.run(['git', '-C', RAIZ, 'rev-parse', '--short=10', 'HEAD'],
                             capture_output=True, text=True).stdout.strip()
        assunto = subprocess.run(['git', '-C', RAIZ, 'log', '-1', '--pretty=%s'],
                                 capture_output=True, text=True).stdout.strip()
        valores.append(
            f"('deploy','codebuild','sistema-suplemento',now(),{esc(assunto[:300])},"
            f"{esc(sha)},'deploy.sh',NULL,NULL,NULL,NULL,NULL)")

    if not valores:
        print('  nada novo para registrar')
        return 0

    sql("\\set ON_ERROR_STOP on\n"
        "INSERT INTO public.dev_evento\n"
        "  (tipo,fonte,projeto,quando,titulo,ref,autor,ambiente,status,arquivos,inseridas,removidas)\n"
        "VALUES\n" + ',\n'.join(valores) + "\nON CONFLICT DO NOTHING;\n")
    print(f'  {len(valores)} registro(s) enviado(s)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
