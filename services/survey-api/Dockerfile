FROM node:20-alpine AS base

WORKDIR /app

COPY --chown=node:node package.json package-lock.json* ./

RUN npm install --omit=dev && npm cache clean --force

COPY --chown=node:node src/ ./src/
RUN chmod -R a+rX /app/src

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
