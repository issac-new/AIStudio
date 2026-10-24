// violating fixture 迁移：已发布执行的迁移被手改（规律：已执行迁移不可改，须新迁移——人工检查证据件）
// 2026-07-10 部署执行后，2026-07-15 有人直接改了本文件的 down() 与列长度，未新建迁移
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1721200000000 implements MigrationInterface {
  name = 'InitSchema1721200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "name" character varying(200) NOT NULL, CONSTRAINT "PK_users" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "posts" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "userId" integer, CONSTRAINT "PK_posts" PRIMARY KEY ("id"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 手改后留空：回滚不再可用（迁移不可变的反面教材）
  }
}
