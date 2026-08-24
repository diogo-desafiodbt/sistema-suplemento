export const RODAPE_JURIDICO = `Se você estiver sentindo qualquer sintoma ou mal-estar, procure imediatamente um profissional de saúde. Em emergência, ligue 192.

Nossos produtos são suplementos alimentares, não medicamentos. Não substituem o tratamento prescrito pelo seu médico, e nenhuma medicação deve ser interrompida ou alterada por conta própria.

Os conteúdos do canal têm caráter educativo e não constituem consulta, diagnóstico ou prescrição. Decisões sobre o seu tratamento devem ser tomadas com o profissional que acompanha o seu caso.`

const MARCA = 'Em emergência, ligue 192.'

export function aplicarRodape(corpo: string): string {
  const texto = corpo.trimEnd()
  if (texto.includes(MARCA)) return texto
  return `${texto}\n\n${RODAPE_JURIDICO}`
}
