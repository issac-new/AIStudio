// violating fixture 实体：@ManyToOne eager:true 无 @Index
// → fw_typeorm_eager_n1(warn) + fw_typeorm_fk_index(warn)
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
} from 'typeorm';
import { User } from './User';

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  // eager:true 每次 find 隐式 JOIN（N+1 变种）；外键列无索引
  @ManyToOne(() => User, (user) => user.posts, { eager: true })
  user: User;
}
