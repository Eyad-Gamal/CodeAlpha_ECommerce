FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "--no-warnings", "backend/server.js"]
