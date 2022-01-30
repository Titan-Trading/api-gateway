FROM node:16

WORKDIR /var/www

COPY ./package*.json ./
COPY ./tsconfig.json ./

RUN yarn install

COPY . .

RUN yarn build