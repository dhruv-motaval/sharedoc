FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=10000 DB_PATH=/app/data/app.db
EXPOSE 10000
CMD ["npm", "start"]
