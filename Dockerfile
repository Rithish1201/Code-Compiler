FROM node:20-slim

# Install C/C++ compilers and Python
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
