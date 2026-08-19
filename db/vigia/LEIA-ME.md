# Vigia

Alarme para o que **deixa de acontecer**. Nasceu em 19/08/2026, depois de a
camada assíncrona inteira ficar dias parada sem gerar um único erro.

## Por que não basta Sentry

| Problema | O que pega |
|---|---|
| Erro que acontece | Sentry |
| **Coisa que deixa de acontecer** | este vigia |
| Erro que acontece demais | agregação |

O incidente de 19/08 foi o segundo caso: o app estava registrado no Inngest com
um endereço inválido, então as funções simplesmente nunca eram chamadas.
Ninguém lançou exceção. **Silêncio não é evento.**

## O princípio

As consultas perguntam **"o cliente está sendo prejudicado agora?"**, não
"o job está saudável?".

*"Existe pagamento pago há mais de 10 minutos sem pedido?"* teria pego o
incidente na hora, sem saber nada sobre Inngest — e pega também o job que roda
e faz errado, que nenhuma checagem de saúde veria.

## Por que fora do Inngest

O vigia roda pela tarefa ECS `db-admin`, agendada pelo EventBridge. Se fosse
mais um job do Inngest, teria ficado mudo junto com os outros em 19/08 — o
silêncio teria silenciado o alarme.

## Estado, para o alarme não virar ruído

`alertas` guarda impressão digital do problema. Notifica **só o que é novo**;
o que persiste fica registrado sem gritar; o que some é fechado sozinho; se
voltar depois, notifica de novo.

Sem isso, os 9 alertas encontrados na primeira execução disparariam a cada hora
para sempre. Foi assim que as 643 falhas do IMAP passaram despercebidas: ruído
demais para alguém olhar.

## Arquivos

- `01-tabela.sql` — a tabela de estado. Roda uma vez.
- `02-rodar.sql` — as seis perguntas + contabilidade. Roda de hora em hora.

Para rodar à mão:

```
./scripts/rodar-sql.sh clinico db/vigia/02-rodar.sql
```

## Como o alarme chega

O script imprime `ALERTA <tipo>` só para o que é novo. Um filtro de métrica no
log `/ecs/db-admin` conta essas linhas e dispara alarme do CloudWatch para um
tópico SNS, que envia e-mail para `diogo@desafiodiabetes.com`.

A cadeia inteira é independente da aplicação: banco → tarefa ECS → CloudWatch →
SNS. Nada disso passa pelo Next, pelo Inngest ou pelo ALB.

## Armadilha já paga

`background_jobs.job_type` é **enum**. Sem `::job_type` no `VALUES`, o Postgres
devolve `42883` — o mesmo erro que quebrou três consultas do sistema em 19/08.
Eu reintroduzi ele aqui na primeira tentativa. Está corrigido; não remova o cast.
