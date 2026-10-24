# violating fixture：生产部署用 migrate dev（交互式/漂移 reset 风险）
# → fw_prisma_migrate_deploy(fail)
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install
CMD npx prisma migrate dev && node src/index.js
