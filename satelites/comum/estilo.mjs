/**
 * Tokens e classes compartilhadas dos satélites do admin.
 * Mesma paleta da casca React — sem duplicar tokens em cada handler.
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

/** Classes base: .card, .tabela, .selo, .btn, .vazio */
export function classesCss() {
  return `
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 12px 16px;
  font-family: Roboto, ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: var(--tinta);
  line-height: 1.45;
  background: transparent;
}
main { margin: 0 auto; padding: 0 0 24px; }

.card {
  background: var(--papel);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
  padding: 20px 22px;
  margin-bottom: 16px;
  box-shadow: 0 1px 2px rgba(19, 36, 79, 0.04);
}
.card h2 {
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
`
}

/** CSS completo para injetar no `<style>` do satélite. */
export function estiloBase() {
  return tokensCss() + classesCss()
}
