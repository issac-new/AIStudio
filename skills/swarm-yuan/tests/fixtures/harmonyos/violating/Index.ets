// harmonyos fixture violating (ArkTS): 受限 API 无权限声明 + 主线程循环 + any 逃逸 + 无生命周期释放 + 无 @State + TaskPool 无捕获
import { abilityAccessCtrl, Permissions } from '@kit.AbilityKit';

@Entry
@Component
struct Index {
  private count: number = 0;  // 普通变量无 @State → UI 不刷新

  aboutToAppear(): void {
    let loc = abilityAccessCtrl.createAtManager().getLocation();  // 受限 API（无权限声明）
    let sum = 0;
    for (let i = 0; i < 1000000; i++) {  // 主线程重计算
      sum += i;
    }
    let x: any = { a: 1 };  // any 逃逸
    x.b;
    TaskPool.execute(() => { return 1; });  // 并发无异常捕获
  }
}

// ability 生命周期：有 onCreate 无 onDestroy
export default class MainAbility extends Ability {
  onCreate(): void {
    console.info('created');
  }
}
