Captação de lead: uma Lambda, uma função de banco, zero privilégio de tabela.

O navegador chega pela CloudFront (`/api/*`, que já existe e aceita POST) e
pelo ALB. Não há sessão nem cookie: este é o único endereço do sistema que
atende a internet aberta sem identificar quem chama.

Papel `captacao_lead`, token IAM, banco `clinico`. Alcance: `EXECUTE` em
`marketing.captar_lead` e nada mais. Ele não lê nem escreve em tabela nenhuma,
e não enxerga o schema `public`. Se a função for comprometida, o que o atacante
alcança é o que a função devolve — um número.

Normalização do e-mail, conferência da supressão, conflito que não sobrescreve
a origem e o consentimento append-only vivem dentro da função. Aqui não se
repete nada disso.

A origem não vem do navegador: só os códigos de `ORIGENS_ACEITAS` entram.
Aceitar o valor do cliente deixaria qualquer um despejar cadastro em qualquer
balde e corromper a segmentação.

A armadilha é o campo `sobrenome`, escondido no formulário. Preenchido,
responde 200 e não grava.

Sem captcha, por decisão de 27/08/2026. A armadilha pega robô comum, e a
validação da lista antes de qualquer disparo é o que impede endereço inventado
de virar bounce. Se aparecer sujeira nos cadastros, entra um captcha depois.

Nenhum e-mail, nome ou id de pessoa em log além do id numérico do lead.
