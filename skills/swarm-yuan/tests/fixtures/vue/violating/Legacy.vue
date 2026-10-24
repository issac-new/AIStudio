<!--
violating fixture 追加（2026-07-20 P1 唤醒）：
  - 普通 script 块（非组合式 setup 语法糖）→ 拉低 setup 比例 → fw_vue_script_setup(fail)
  - export default 单行选项式写法（data/methods）→ fw_vue_no_options_api(fail)
注意：本文件注释不得出现 "<scr" + "ipt setup" 字面量（会被文件级 grep 误计为 setup 文件中和触发）。
-->
<script lang="ts">
export default { data() { return { count: 0 }; }, methods: { inc() { this.count++; } } };
</script>

<template>
  <div>{{ count }}</div>
</template>
