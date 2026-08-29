// A busca do topo estava `disabled` com o titulo "Em breve", em todas as
// telas. Controle morto no lugar mais nobre da tela.
//
// Ela nao vira busca universal aqui: manda para a lista de clientes, que ja
// tem busca por nome, e-mail, CPF e codigo. Uma caixa que leva a algum lugar
// vale mais que uma caixa que promete.

export function BuscaGlobal() {
  return (
    <form
      action="/suplementos/admin/clientes"
      method="GET"
      style={{ flex: 1, display: 'flex' }}
    >
      <input
        type="search"
        name="q"
        className="admin-busca"
        placeholder="Buscar cliente por nome, e-mail ou código"
        aria-label="Buscar cliente"
      />
    </form>
  )
}
