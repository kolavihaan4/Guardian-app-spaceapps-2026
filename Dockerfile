# The Guardian site: the Node server, which also serves the built web app.
# The ultrasound models run in a second image (ai/ultrasound_service/Dockerfile).
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
# The triage route reads its system prompt from ai/training (the large model folders are left out by .dockerignore).
COPY ai ./ai
RUN npm ci && npm run build
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["npm", "run", "start"]
