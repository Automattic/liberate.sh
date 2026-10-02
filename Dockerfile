# liberate.sh production image.

FROM node:24-bookworm-slim AS base
ENV NODE_ENV=production \
	NPM_CONFIG_UPDATE_NOTIFIER=false \
	NPM_CONFIG_FUND=false \
	NPM_CONFIG_AUDIT=false
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM base
RUN apt-get update \
	&& apt-get install -y --no-install-recommends tini \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist dist
COPY src src

ENV PORT=8080
EXPOSE 8080
ENTRYPOINT [ "tini", "--" ]
CMD [ "node", "src/server/index.ts" ]
