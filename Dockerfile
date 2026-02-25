FROM node:22-alpine

RUN corepack enable && corepack prepare yarn@stable --activate

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./

RUN yarn install

COPY . .

RUN yarn prisma:generate

RUN yarn build

CMD ["yarn", "start:prod"]