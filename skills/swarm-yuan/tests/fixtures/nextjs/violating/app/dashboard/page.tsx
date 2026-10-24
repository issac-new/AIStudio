// violating fixture 追加（2026-07-20 P1 唤醒）：app/ 侧定义 /dashboard 路由，
// 与 pages/dashboard.tsx 同路径双定义 → fw_nextjs_router_conflict(fail)
export default function DashboardPage() {
  return <div>app dashboard</div>;
}
