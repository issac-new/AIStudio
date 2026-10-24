// violating fixture 实体：eager 关联 + 无 @Index + 无审计字段
import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany, DeleteDateColumn,
} from 'typeorm';
import { Post } from './Post';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // 懒加载关联 Promise<T>：序列化丢字段（fw_typeorm_lazy_relation warn）
  @OneToMany(() => Post, (post) => post.user)
  posts: Promise<Post[]>;

  @DeleteDateColumn()
  deletedAt: Date;
}
