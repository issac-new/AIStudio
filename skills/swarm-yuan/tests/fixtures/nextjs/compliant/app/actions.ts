// compliant fixture: Server Action 显式鉴权
'use server';

import { auth } from './auth';
import { db } from './db';

export async function deleteUserAction(userId: string) {
  const session = await auth(); // 显式鉴权
  if (!session?.user?.isAdmin) {
    throw new Error('Unauthorized');
  }
  await db.user.delete({ where: { id: userId } });
}
