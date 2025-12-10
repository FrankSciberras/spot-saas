FROM node:23-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

RUN npm run build

# Uncomment this line in prod
# RUN rm -rf ./src

CMD npm run start