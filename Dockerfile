FROM node:22-alpine

RUN corepack enable && corepack prepare yarn@stable --activate

WORKDIR /app

COPY . .

RUN yarn install

RUN yarn prisma:generate

RUN yarn build

CMD ["yarn", "start:prod"]