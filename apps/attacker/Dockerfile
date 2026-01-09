FROM node:20-bullseye-slim

WORKDIR /app
COPY package.json /app/package.json
RUN npm install --omit=dev

COPY server.js /app/server.js
COPY public /app/public

ENV PORT=9000
ENV TARGET_BASE=http://shop:8000
EXPOSE 9000

CMD ["node", "server.js"]
