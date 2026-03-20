FROM node:24-alpine
WORKDIR /app
RUN npm install discord.js
RUN npm install pg
COPY . .
CMD ["node", "--env-file=.env", "index.js"]