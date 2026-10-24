// compliant fixture 实体：外键列显式 @Index + 无 eager + 审计字段
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity('posts')
@Index(['user'])
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @ManyToOne(() => User, (user) => user.posts)
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
