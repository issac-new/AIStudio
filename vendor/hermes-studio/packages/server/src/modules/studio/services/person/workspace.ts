import { join } from 'node:path'
import { getWebUiHome } from '../../public/config'
import { personSettings } from '../../repositories/person-store'

export function personWorkspace(userId: number): string {
  return personSettings(userId).settings.workspace || join(getWebUiHome(), 'person', String(userId), 'workspace')
}
