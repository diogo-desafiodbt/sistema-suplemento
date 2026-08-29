/**
 * Tokens e classes compartilhadas dos satélites do admin.
 * Classes novas nascem aqui — não no handler.
 *
 * Os valores são os mesmos do `admin.css` do núcleo, de propósito: estas
 * telas vivem dentro de um iframe na moldura do admin, e duas linguagens
 * visuais na mesma tela é o que se estava consertando em 29/08/2026.
 * Mudou lá, muda aqui.
 */
export function tokensCss() {
  return `
:root {
  --fundo: #f5f5f7;
  --papel: #ffffff;
  --papel-2: #fbfbfd;
  --tinta: #1d1d1f;
  --tinta-media: #55565a;
  --tinta-fraca: #86868b;
  --borda: rgba(0, 0, 0, .09);
  --borda-fraca: rgba(0, 0, 0, .05);
  --vermelho: #f4001e;
  --vermelho-suave: rgba(244, 0, 30, .08);
  --marinho: #13244f;
  --ok: #2b7a55;
  --ok-fundo: rgba(43, 122, 85, .1);
  --atencao: #9a6612;
  --atencao-fundo: rgba(154, 102, 18, .1);
  --perigo: #b3261e;
  --perigo-fundo: rgba(179, 38, 30, .09);
  --raio: 10px;
  --raio-g: 14px;
  --raio-p: 7px;
  --sombra: 0 1px 2px rgba(0, 0, 0, .04), 0 4px 14px rgba(0, 0, 0, .04);
}
`
}

/** Classes base: .card, .tabela, .selo, .btn, .vazio + auxiliares de tela */
export function classesCss() {
  return `
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0 4px 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI',
    system-ui, sans-serif;
  font-size: 14px;
  color: var(--tinta);
  line-height: 1.45;
  letter-spacing: -.005em;
  background: transparent;
  -webkit-font-smoothing: antialiased;
}
/* Sem teto de largura: a tela vive dentro de um iframe que ja tem o respiro
   da moldura do admin. Um segundo limite aqui deixava a aba de campanhas e a
   de pedidos numa coluna estreita no meio de uma tela larga. */
main { margin: 0; width: 100%; }

.cabeca {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.cabeca-trilha {
  margin: 0 0 4px;
  font-size: 12.5px;
  font-weight: 450;
  letter-spacing: -.003em;
  text-transform: none;
  color: var(--tinta-fraca);
}
.cabeca-titulo {
  margin: 0;
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -.021em;
  color: var(--tinta);
  line-height: 1.15;
}
.cabeca-meta { font-size: 13px; color: var(--tinta-fraca); font-variant-numeric: tabular-nums; }

.card {
  background: var(--papel);
  border: 1px solid var(--borda-fraca);
  border-radius: var(--raio-g);
  padding: 17px 18px 18px;
  margin-bottom: 14px;
  box-shadow: var(--sombra);
}
.card-flush { padding: 14px 0 4px; overflow: hidden; }
.card h2, .card-rotulo {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 590;
  letter-spacing: -.012em;
  text-transform: none;
  color: var(--tinta);
}

.tabela-wrap { overflow-x: auto; width: 100%; }
.tabela, table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.tabela th, table th {
  text-align: left;
  padding: 0 16px 9px;
  font-size: 12px;
  font-weight: 550;
  letter-spacing: -.003em;
  text-transform: none;
  color: var(--tinta-fraca);
  border-bottom: 0;
  white-space: nowrap;
}
.tabela td, table td {
  padding: 11px 16px;
  border-bottom: 0;
  border-top: 1px solid var(--borda-fraca);
  vertical-align: middle;
  color: var(--tinta);
}
.tabela tr:hover td, table tr:hover td {
  background: var(--papel-2);
}
.num { font-variant-numeric: tabular-nums; }

.selo {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -.003em;
  text-transform: none;
  border-radius: 20px;
  padding: 2.5px 9px;
  white-space: nowrap;
}
.selo::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
.selo-ok { background: var(--ok-fundo); color: var(--ok); }
.selo-perigo { background: var(--perigo-fundo); color: var(--perigo); }
.selo-atencao { background: var(--atencao-fundo); color: var(--atencao); }
.selo-neutro { background: var(--borda-fraca); color: var(--tinta-fraca); }
.selo-info { background: var(--borda-fraca); color: var(--tinta-media); }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
  transition: background .15s ease, filter .15s ease, transform .08s ease;
}
.btn:active { transform: scale(.975); }
.btn-primario { background: var(--vermelho); color: #fff; }
.btn-primario:hover { filter: brightness(1.07); }
.btn-secundario {
  background: var(--papel);
  color: var(--tinta);
  border-color: var(--borda);
}
.btn-secundario:hover { background: var(--papel-2); }
.btn-compacto { height: 28px; padding: 0 11px; font-size: 12.5px; }

.vazio {
  text-align: center;
  padding: 52px 24px;
  color: var(--tinta-fraca);
}
.vazio-titulo {
  margin: 0 0 5px;
  font-size: 15px;
  font-weight: 550;
  color: var(--tinta);
}
.vazio-texto {
  margin: 0 auto;
  max-width: 36rem;
  font-size: 13.5px;
  line-height: 1.5;
}
.vazio-acao { margin-top: 18px; }

.muted { color: var(--tinta-fraca); font-size: 12.5px; }
.nome { margin: 0; font-weight: 500; color: var(--tinta); }
.sub { margin: 2px 0 0; font-size: 12.5px; color: var(--tinta-fraca); }
.mono { font-family: ui-monospace, 'SF Mono', monospace; font-size: 12px; color: var(--tinta-fraca); }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}

/* Duas colunas onde a tela comporta: formulario de um lado, previa do outro. */
.duas-colunas {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}

@media (min-width: 1100px) {
  .duas-colunas {
    grid-template-columns: 1fr 1fr;
  }
}
label {
  display: block;
  font-size: 12.5px;
  font-weight: 450;
  letter-spacing: -.003em;
  text-transform: none;
  color: var(--tinta-fraca);
  margin-bottom: 4px;
}
input, select, textarea {
  width: 100%;
  border: 1px solid var(--borda);
  border-radius: 8px;
  padding: 7px 11px;
  font-size: 13px;
  color: var(--tinta);
  background: var(--papel);
  font-family: inherit;
  transition: border-color .15s ease, box-shadow .15s ease;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--vermelho) 45%, var(--borda));
  box-shadow: 0 0 0 3.5px var(--vermelho-suave);
}
.acoes { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.acoes-col { display: flex; flex-direction: column; gap: 6px; min-width: 10rem; }
.acoes-col form { margin: 0; }
.acoes-col .btn { display: flex; width: 100%; }

.flash-ok {
  background: var(--ok-fundo);
  color: var(--ok);
  border-radius: var(--raio);
  padding: 10px 13px;
  margin-bottom: 14px;
  font-size: 13px;
}
.flash-erro {
  background: var(--perigo-fundo);
  color: var(--perigo);
  border-radius: var(--raio);
  padding: 10px 13px;
  margin-bottom: 14px;
  font-size: 13px;
}

.lista { list-style: none; margin: 0; padding: 0; }
.lista li { padding: 11px 0; border-top: 1px solid var(--borda-fraca); }
.lista li:first-child { border-top: 0; }
.linha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.passagem {
  font-size: 27px;
  font-weight: 590;
  letter-spacing: -.028em;
  color: var(--tinta);
  margin: 0 0 5px;
  font-variant-numeric: tabular-nums;
}
.passagem-problema { color: var(--perigo); }
.aviso {
  background: var(--atencao-fundo);
  color: var(--atencao);
  border-radius: var(--raio);
  padding: 10px 13px;
  font-size: 13px;
}
.contagem-selo {
  font-weight: 550;
  font-size: 11.5px;
  background: var(--borda-fraca);
  color: var(--tinta-fraca);
  border-radius: 999px;
  padding: 1px 7px;
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}

/* Abas do satélite: pastilha, como o seletor segmentado do iOS. */
.tabs {
  background: var(--borda-fraca);
  border-bottom: 0;
  border-radius: 9px;
  padding: 2px;
  display: inline-flex;
  gap: 2px;
  overflow-x: auto;
  margin-bottom: 16px;
}
.tabs a {
  padding: 5px 13px;
  border-radius: 7px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--tinta-media);
  text-decoration: none;
  white-space: nowrap;
  transition: background .15s ease, color .15s ease;
}
.tabs a:hover { color: var(--tinta); }
.tabs a.ativa {
  background: var(--papel);
  color: var(--tinta);
  font-weight: 550;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .08);
}
.config-chave {
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--tinta-fraca);
  margin: 0 0 4px;
}
.config-linha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.config-linha input { flex: 1; min-width: 200px; font-family: ui-monospace, 'SF Mono', monospace; }
.sem-acao { font-size: 12.5px; color: var(--tinta-fraca); }

:focus-visible { outline: 2px solid var(--vermelho); outline-offset: 2px; }

@media (max-width: 859px) {
  body { padding: 0 0 20px; font-size: 15px; }
  .cabeca-titulo { font-size: 22px; }
  .card { padding: 15px 15px 16px; }
  .tabela th, .tabela td, table th, table td { padding-left: 12px; padding-right: 12px; }
  .tabs { width: 100%; }
  .acoes-col { min-width: 0; width: 100%; }
  .config-linha input { min-width: 0; }
}
`
}

export function estiloBase() {
  return tokensCss() + classesCss()
}
