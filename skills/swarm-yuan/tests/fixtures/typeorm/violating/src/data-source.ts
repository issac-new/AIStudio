// violating fixture:
//  - synchronize: true（生产自动改表）→ fw_typeorm_synchronize_prod(fail)
//  - 未配 poolSize → fw_typeorm_pool(warn)
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
  synchronize: true,
  logging: true,
  entities: [User, Post],
  migrations: ['src/migrations/*.ts'],
});
