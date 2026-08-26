# Imagem do sistema-suplemento para ECS Fargate.
#
# O `next build` acontece FORA daqui, na máquina/CI, e este Dockerfile só
# empacota o resultado. A alternativa (buildar dentro do container) derruba
# o Docker Desktop por falta de memória num Mac com pouca RAM livre — e não
# traz ganho real, já que o artefato é o mesmo.
#
# Use `./scripts/build-image.sh`, que garante a ordem correta: build antes,
# empacotamento depois. Uma imagem construída sobre um `.next` velho é o
# risco desse desenho, e o script existe para eliminá-lo.

# Espelho da AWS, não o Docker Hub. O Hub limita download anônimo, e em
# 26/08/2026 o deploy quebrou com "429 Too Many Requests" — falha externa, sem
# relação com o código, que volta sozinha quando menos convém. O espelho é a
# mesma imagem, sem limite, e o projeto já o usa no contêiner do vigia.
FROM public.ecr.aws/docker/library/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

# Usuário sem privilégio — se alguém escapar do processo, não é root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# O standalone já traz o node_modules podado de que precisa (~52 MB).
COPY --chown=nextjs:nodejs .next/standalone ./
# Estáticos não vêm no standalone; sem esta linha o site sobe sem CSS.
COPY --chown=nextjs:nodejs .next/static ./.next/static
COPY --chown=nextjs:nodejs public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
