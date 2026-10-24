-- compliant fixture：迁移一经发布不再修改；后续变更一律新增迁移目录
CREATE TABLE "User" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, PRIMARY KEY ("id"));
CREATE TABLE "Post" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, "authorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, PRIMARY KEY ("id"));
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");
