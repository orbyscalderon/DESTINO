FROM node:22-slim

# Dependencias para compilar mediasoup (native bindings)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001
# UDP range para mediasoup
EXPOSE 40000-40099/udp

CMD ["node", "server.js"]
