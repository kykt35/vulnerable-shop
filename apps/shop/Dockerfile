FROM node:20-bullseye-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json /app/package.json
RUN npm install --omit=dev

COPY src /app/src
COPY views /app/views
COPY public /app/public

ENV PORT=4000
EXPOSE 4000

CMD ["node", "src/server.js"]
