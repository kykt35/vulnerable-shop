FROM node:20-bullseye-slim

WORKDIR /app
COPY package.json /app/package.json
RUN npm install --omit=dev

COPY server.js /app/server.js
COPY public /app/public

ENV PORT=5000
ENV TARGET_BASE=http://shop:4000
EXPOSE 5000

CMD ["node", "server.js"]
