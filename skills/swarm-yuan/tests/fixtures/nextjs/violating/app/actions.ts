// violating fixture: Server Action 未鉴权
// → fw_nextjs_server_action_auth(fail)
'use server';

import { db } from './db';

export async function deleteUserAction(userId: string) {
  // 无 auth()/getServerSession() 鉴权：任意客户端可调 → 越权删用户
  await db.user.delete({ where: { id: userId } });
}
