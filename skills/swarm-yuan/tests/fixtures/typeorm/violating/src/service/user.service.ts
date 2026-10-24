// violating fixture 服务：
//  - where 模板插值 → fw_typeorm_qb_injection(fail)
//  - 事务内混用 getRepository → fw_typeorm_transaction_runner(warn)
//  - 软删除实体上 .delete() → fw_typeorm_soft_delete(warn)
//  - offset/limit 配 leftJoin 分页 → fw_typeorm_pagination_offset(warn)
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';

export class UserService {
  async findByName(name: string) {
    // SQL 注入面：模板插值直接进 where
    return AppDataSource.createQueryBuilder()
      .select('u')
      .from(User, 'u')
      .leftJoinAndSelect('u.posts', 'p')
      .where(`u.name = '${name}'`)
      .offset(0)
      .limit(20)
      .getMany();
  }

  async transfer(fromId: number, toId: number, amount: number) {
    await AppDataSource.transaction(async () => {
      // 混用全局 getRepository —— 写入绕过事务
      const from = await AppDataSource.getRepository(User).findOneBy({ id: fromId });
      const to = await AppDataSource.getRepository(User).findOneBy({ id: toId });
      await AppDataSource.getRepository(User).save([from, to]);
    });
  }

  async removeUser(id: number) {
    // 实体有 @DeleteDateColumn，应 softDelete 而非物理删除
    await AppDataSource.getRepository(User).delete(id);
  }
}
