// compliant fixture:
//  - synchronize: false + migrationsRun: true（迁移驱动 schema 演进）
//  - poolSize 显式配置
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './entity/User';
import { Post } from './entity/Post';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: 5432,
  username: 'app',
  password: process.env.DB_PASSWORD,
  database: 'appdb',
  synchronize: false,
  migrationsRun: true,
  logging: ['error', 'warn'],
  poolSize: 10,
  extra: {
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  entities: [User, Post],
  migrations: ['src/migrations/*.ts'],
});
