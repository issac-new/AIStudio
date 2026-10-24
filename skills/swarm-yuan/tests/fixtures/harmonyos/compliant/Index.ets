// harmonyos fixture compliant (ArkTS): 权限已声明 + TaskPool 有捕获 + @State + 生命周期配对 + 无 any
import { taskpool } from '@kit.ArkTS';

@Entry
@Component
struct Index {
  @State count: number = 0;

  aboutToAppear(): void {
    try {
      let task = new taskpool.Task(() => { return 1; });
      taskpool.execute(task).then((v) => { this.count = v as number; }).catch((e) => { console.error(e); });
    } catch (e) {
      console.error(e);
    }
  }
}

export default class MainAbility extends Ability {
  onCreate(): void {
    console.info('created');
  }
  onDestroy(): void {
    console.info('released');
  }
}
