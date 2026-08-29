Ingestão de eventos da Resend: uma Lambda, uma função de banco, zero leitura.

Recebe `POST /api/webhooks/resend`. É o segundo endereço público do sistema sem
sessão nenhuma — o outro é a captação de lead.

Papel `ingestao_marketing`, token IAM, banco `clinico`. Alcance: `EXECUTE` em
`marketing.registrar_evento` e nada mais. Não lê nem escreve em tabela. Se a
função for comprometida, o atacante consegue inventar evento; não consegue ler
a base de leads.

A assinatura Svix é conferida **antes de qualquer parse**, sobre o corpo exato
que chegou. Reserializar o JSON muda um espaço e a conta não fecha mais.

Códigos de resposta, e o porquê de cada um:
- 401 assinatura inválida, cabeçalho faltando ou carimbo fora da janela de 5 min
- 200 evento que não interessa — recusar deixaria a Resend reenviando para sempre
- 500 falha nossa, para a Resend reenviar

Supressão e contadores acontecem dentro da função do banco. Aqui não se repete
nenhuma regra: só a tradução do nome do evento e a leitura de hard/soft.
