# Prompts de execução

Um arquivo por tarefa, na ordem do plano. Referencie no Cursor com `@nome-do-arquivo.md`.

Cada prompt traz: o problema com file:line, a correção esperada, o que **não**
fazer, e como a entrega será verificada. O "não faça" existe porque a maior
parte do retrabalho vem de mudanças fora do escopo pedido.

- `fase-0/` — fechar o que está aberto hoje. Não depende de nada.
- `fase-1/` — tirar dado externo do banco clínico.
- `fase-3/` — núcleo para o RDS.
- `correcoes/` — defeito que apareceu em produção e não pertence a fase nenhuma.

Plano completo: https://claude.ai/code/artifact/3d8d9736-3bbd-405d-8430-b93fd2a920d5
Regra de arquitetura: https://claude.ai/code/artifact/7da5ee4b-1832-4bc6-bcc1-6de49afa0ba3
