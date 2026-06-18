# Production image for the Rovora dashboard (Next.js).
# Used by Coolify on the Hetzner server. The database is NOT here —
# it stays on Supabase cloud. This container only runs the web app.

FROM node:22-alpine AS deps
WORKDIR /app
# Install dependencies from the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are baked into the browser bundle HERE, at build time.
# Coolify passes any variable marked "Build Variable" as a --build-arg; these
# ARG/ENV lines receive them so `next build` can see them. If you add a new
# NEXT_PUBLIC_ variable later, add a matching ARG + ENV line here too.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_TIME_ZONE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_TIME_ZONE=$NEXT_PUBLIC_TIME_ZONE

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Copy only what's needed to run the already-built app.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
EXPOSE 3000
CMD ["npm", "run", "start"]
