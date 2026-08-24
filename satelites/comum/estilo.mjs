/**
 * Tokens e classes compartilhadas dos satélites do admin.
 * Classes novas nascem aqui — não no handler.
 */
export function tokensCss() {
  return `
:root {
  --marinho: #13244f;
  --vermelho: #f4001e;
  --fundo: #fafbfe;
  --papel: #ffffff;
  --borda: #e2e8ee;
  --tinta: #212529;
  --tinta-fraca: #6c757d;
  --ok: #7dc668;
  --perigo: #ff7076;
  --atencao: #f5b666;
  --raio: 4px;
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
  font-family: Roboto, ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: var(--tinta);
  line-height: 1.45;
  background: transparent;
}
main { margin: 0 auto; max-width: 1080px; }

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
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--tinta-fraca);
}
.cabeca-titulo {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--tinta);
  line-height: 1.15;
}
.cabeca-meta { font-size: 14px; color: var(--tinta-fraca); font-variant-numeric: tabular-nums; }

.card {
  background: var(--papel);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
  padding: 20px 22px;
  margin-bottom: 16px;
  box-shadow: 0 1px 2px rgba(19, 36, 79, 0.04);
}
.card-flush { padding: 0; overflow: hidden; }
.card h2, .card-rotulo {
  margin: 0 0 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--tinta-fraca);
}

.tabela-wrap { overflow-x: auto; width: 100%; }
.tabela, table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.tabela th, table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--tinta-fraca);
  border-bottom: 1px solid var(--borda);
}
.tabela td, table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--borda);
  vertical-align: middle;
  color: var(--tinta);
}
.tabela tr:hover td, table tr:hover td {
  background: rgba(19, 36, 79, 0.03);
}
.num { font-variant-numeric: tabular-nums; }

.selo {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .03em;
  text-transform: uppercase;
  border-radius: var(--raio);
  padding: 3px 8px;
}
.selo-ok { background: color-mix(in srgb, var(--ok) 22%, white); color: #2f6b24; }
.selo-perigo { background: color-mix(in srgb, var(--perigo) 22%, white); color: #9b2c2c; }
.selo-atencao { background: color-mix(in srgb, var(--atencao) 28%, white); color: #8a5a12; }
.selo-neutro { background: #f0f2f5; color: var(--tinta-fraca); }
.selo-info { background: #e8f0fe; color: #1e4fad; }

.btn {
  display: inline-block;
  border: 0;
  border-radius: var(--raio);
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
}
.btn-primario { background: var(--vermelho); color: #fff; }
.btn-primario:hover { filter: brightness(0.92); }
.btn-secundario {
  background: var(--papel);
  color: var(--marinho);
  border: 1px solid var(--borda);
}
.btn-secundario:hover { background: rgba(19, 36, 79, 0.04); }
.btn-compacto { padding: 6px 12px; font-size: 12px; }

.vazio {
  text-align: center;
  padding: 40px 20px;
  color: var(--tinta-fraca);
}
.vazio-titulo {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--tinta);
}
.vazio-texto {
  margin: 0 auto;
  max-width: 36rem;
  font-size: 14px;
  line-height: 1.5;
}
.vazio-acao { margin-top: 16px; }

.muted { color: var(--tinta-fraca); font-size: 13px; }
.nome { margin: 0; font-weight: 600; color: var(--tinta); }
.sub { margin: 2px 0 0; font-size: 12px; color: var(--tinta-fraca); }
.mono { font-family: ui-monospace, monospace; font-size: 12px; color: var(--tinta-fraca); }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--tinta-fraca);
  margin-bottom: 4px;
}
input, select, textarea {
  width: 100%;
  border: 1px solid var(--borda);
  border-radius: var(--raio);
  padding: 8px 12px;
  font-size: 14px;
  color: var(--tinta);
  background: var(--papel);
  font-family: inherit;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(19, 36, 79, .15);
}
.acoes { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.acoes-col { display: flex; flex-direction: column; gap: 6px; min-width: 10rem; }
.acoes-col form { margin: 0; }
.acoes-col .btn { display: block; width: 100%; text-align: center; }

.flash-ok {
  background: color-mix(in srgb, var(--ok) 22%, white);
  color: #2f6b24;
  border-radius: var(--raio);
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 14px;
}
.flash-erro {
  background: color-mix(in srgb, var(--perigo) 22%, white);
  color: #9b2c2c;
  border-radius: var(--raio);
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 14px;
}

.lista { list-style: none; margin: 0; padding: 0; }
.lista li { padding: 10px 0; border-top: 1px solid var(--borda); }
.lista li:first-child { border-top: 0; }
.linha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.passagem { font-size: 28px; font-weight: 700; color: var(--tinta); margin: 0 0 6px; font-variant-numeric: tabular-nums; }
.passagem-problema { color: var(--perigo); }
.aviso {
  background: color-mix(in srgb, var(--atencao) 28%, white);
  color: #8a5a12;
  border-radius: var(--raio);
  padding: 10px 12px;
  font-size: 14px;
}
.contagem-selo {
  font-weight: 600;
  font-size: 12px;
  background: var(--marinho);
  color: #fff;
  border-radius: var(--raio);
  padding: 1px 8px;
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}
.tabs {
  background: var(--papel);
  border-bottom: 1px solid var(--borda);
  padding: 10px 0;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-bottom: 16px;
}
.tabs a {
  padding: 8px 16px;
  border-radius: var(--raio);
  font-size: 14px;
  font-weight: 500;
  color: var(--tinta-fraca);
  text-decoration: none;
  white-space: nowrap;
}
.tabs a:hover { background: rgba(19, 36, 79, .08); color: var(--marinho); }
.tabs a.ativa { background: var(--marinho); color: #fff; }
.config-chave {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--tinta-fraca);
  margin: 0 0 4px;
}
.config-linha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.config-linha input { flex: 1; min-width: 200px; font-family: ui-monospace, monospace; }
.sem-acao { font-size: 12px; color: var(--tinta-fraca); }
`
}

export function estiloBase() {
  return tokensCss() + classesCss()
}
