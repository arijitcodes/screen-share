FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
COPY public ./public
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
