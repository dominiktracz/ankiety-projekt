FROM node:20-alpine AS base

WORKDIR /app

COPY --chown=node:node package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=node:node src/ ./src/
RUN chmod -R a+rX /app/src

USER node

CMD ["node", "src/index.js"]
