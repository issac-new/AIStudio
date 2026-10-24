-- violating fixture：已应用迁移被手改（规律：已应用迁移不可改，须新迁移——人工检查证据件）
-- 2026-07-01 migrate deploy 应用后，2026-07-15 有人直接改了列长度，_prisma_migrations checksum 已失配
CREATE TABLE "User" ("id" SERIAL NOT NULL, "name" VARCHAR(500) NOT NULL, PRIMARY KEY ("id"));
CREATE TABLE "Post" ("id" SERIAL NOT NULL, "title" TEXT NOT NULL, "authorId" INTEGER, PRIMARY KEY ("id"));
