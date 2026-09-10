<!-- overlay/custom/client/ia2/views/CommsView.vue -->
<!-- 沟通区：router-view 承载 matrix-chat 子路由（默认房间视图 + room/:roomId，
     路径参数与 cockpit 子路由原样一致，见 routes.ts）。 -->
<template>
  <div class="ia-area ia-area--comms">
    <router-view />
  </div>
</template>
