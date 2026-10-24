// compliant fixture 事务服务：事务内只用回调注入的 manager（无全局连接混用）
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';

export class AccountService {
  async renameInTransaction(id: number, newName: string) {
    await AppDataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id } });
      if (!user) {
        throw new Error('user not found');
      }
      user.name = newName;
      await manager.save(user);
    });
  }
}
