FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
# Root workspace manifest is needed for npm workspaces resolution
COPY ../../package.json /root-workspace-package.json

FROM base AS deps
RUN npm install --omit=dev=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# keep the full dependency tree so the prisma CLI is available at startup
COPY --from=build /app/node_modules ./node_modules
COPY docker-entrypoint.sh ./docker-entrypoint.sh
EXPOSE 3000
CMD ["sh", "docker-entrypoint.sh"]
