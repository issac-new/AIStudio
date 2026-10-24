// violating fixture: 全局注册 naive（no_global_register fail 主触发）
// + 混用第二套 UI 库（no_dual_ui fail，2026-07-20 P1 唤醒）
import naive from 'naive-ui';
import { ElButton } from 'element-plus';
import { createApp } from 'vue';
import App from './Form.vue';

const app = createApp(App);
app.use(naive);
app.mount('#app');
