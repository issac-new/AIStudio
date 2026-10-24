## 事故响应常用命令

### 快速定级与影响评估

```bash
# 当前错误率（Prometheus）
curl -sf -G http://prometheus:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))' \
  | jq '.data.result[0].value[1]'

# 受影响用户估算（最近 5 分钟 5xx 请求）
curl -sf -G http://prometheus:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(http_requests_total{status=~"5.."}[5m])) * 300' \
  | jq '.data.result[0].value[1]'

# 查看当前告警状态
curl -sf http://prometheus:9090/api/v1/alerts | jq '.data.alerts[] | {state: .state, name: .labels.alertname}'
```

### 恢复操作

```bash
# Kubernetes 快速回滚
kubectl rollout undo deployment/<deploy-name> -n <namespace>
kubectl rollout status deployment/<deploy-name> -n <namespace>

# 扩容应急
kubectl scale deployment/<deploy-name> --replicas=10 -n <namespace>

# Helm 回滚
helm rollback <release-name> <revision> -n <namespace>

# 查看最近部署变更（事故关联排查）
kubectl get events --sort-by=.lastTimestamp -n <namespace> | head -20
```

### 时间线收集

```bash
# 告警历史
curl -sf -G http://alertmanager:9093/api/v2/alerts | jq '.[] | {name: .labels.alertname, startsAt: .startsAt, status: .status.state}'

# 部署历史
kubectl rollout history deployment/<deploy-name> -n <namespace>

# Pod 重启时间线
kubectl get pods -n <namespace> -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount,AGE:.metadata.creationTimestamp
```

> 事故响应的铁律：先消除影响（止血），再找根因（手术）。事故现场不是 debug 场所。

### 2. Alertmanager CLI（amtool）

```bash
# 安装 amtool（通常与 Prometheus 一起部署）
# 或从 amtool 容器中运行
docker run --rm -it prom/alertmanager amtool --help

# 查看当前告警状态
amtool alert

# 查询指定告警
amtool alert query alertname=HighErrorRate

# 列出所有静默规则
amtool silence query

# 创建静默（抑制告警，附原因）
amtool silence add --duration=2h \
  --comment="Investigating root cause" \
  alertname=HighErrorRate

# 过期静默
amtool silence expire <silence-id>

# 查看 Alertmanager 状态
amtool status
```

### 3. Grafana OnCall 管理

```bash
# 查看当前值班人员
grafana-oncall schedules list

# 查看轮换计划
grafana-oncall schedules export --id <schedule-id>

# 触发紧急升级
grafana-oncall escalations trigger --alert-group-id <id>

# 查看未响应告警
grafana-oncall alert-groups list --status firing

# 确认告警
grafana-oncall alert-groups acknowledge --id <alert-group-id>

# 通过 API 管理 OnCall
curl -sf -X GET http://grafana:8080/api/v1/schedules \
  -H "Authorization: <token>"
```

### 4. Robusta（Prometheus 告警增强）

```bash
# 安装 Robusta Helm Chart
helm repo add robusta https://robusta-charts.storage.googleapis.com
helm install robusta robusta/robusta \
  --set globalConfig.alertManagerUrl=http://alertmanager:9093

# 查看 Robusta 配置
kubectl get configmap robusta-config -n robusta -o yaml

# 测试告警（触发测试事件）
robusta playbooks trigger test-notification

# 查看增强后的告警
robusta logs --app robusta --tail 50

# Python SDK：自定义 Playbook
pip install robusta-sdk
# 示例：发送告警到 Slack
python3 -c "
from robusta.api import *
class CustomEnricher(Action):
    def run(self, alert: AlertEvent):
        alert.add_enrichment([
            MarkdownBlock('## 告警详情\n- 服务: svc-a\n- 严重度: CRITICAL')
        ])
"
```

### 5. Upptime（状态页监控）

```bash
# 安装 upptime CLI
npm install -g @upptime/cli

# 初始化状态页（交互式）
upptimerc init

# 运行监控
npx upptimerc

# 更新状态页
upptimerc update

# 手动运行健康检查
upptimerc run

# 查看摘要
upptimerc summary

# 配置文件示例（.upptimerc.yml）
# sites:
#   - name: Production API
#     url: https://api.example.com/health
#   - name: Website
#     url: https://example.com
```

### 6. PagerDuty 事件管理

```bash
# 安装 pd-cli
pip install pdcli

# 配置 API Token
pdcli configure

# 列出当前 incident
pdcli incident list --status triggerred,acknowledged

# 查看 incident 详情
pdcli incident show <incident-id>

# 确认 incident
pdcli incident acknowledge <incident-id>

# 解决 incident
pdcli incident resolve <incident-id>

# 列出值班人员
pdcli oncalls list

# 触发测试告警
pdcli alert trigger \
  --service-name "Production API" \
  --title "Test Alert from Incident Commander" \
  --severity critical
```

### 7. AWX（Ansible 运行书自动化）

```bash
# 安装 AWX CLI（awxkit）
pip install awxkit

# 登录 AWX
awx login --host https://awx.example.com --username admin

# 列出模板
awx job_templates list

# 启动运行书作业
awx job_templates launch "Rollback svc-a" --monitor

# 查看作业状态
awx jobs list --status running

# 查看作业输出
awx jobs stdout <job-id>

# 创建工作流模板
awx workflow_job_templates create \
  --name "Incident Response: Rollback" \
  --organization Default

# 列出已认证主机
awx hosts list
```

### 8. 报告生成（Postmortem 文档化）

**Pandoc（结构化报告生成）**

```bash
# 将 Markdown 复盘报告转为 PDF
pandoc postmortem.md -o postmortem.pdf \
  --pdf-engine=xelatex \
  -V mainfont='Noto Sans CJK SC'

# 转为 DOCX（供团队协作编辑）
pandoc postmortem.md -o postmortem.docx

# 合并多个 Markdown 文件为一个报告
pandoc timeline.md impact.md root_cause.md action_items.md \
  -o full_postmortem.pdf

# 使用自定义模板
pandoc postmortem.md --template=postmortem.template \
  -o postmortem.pdf
```

**Mermaid CLI — 时间线生成**

```bash
# 安装 mermaid-cli
npm install -g @mermaid-js/mermaid-cli

# 将 mermaid 时间线定义渲染为 PNG
mmdc -i timeline.mmd -o timeline.png

# 渲染为 SVG（矢量图）
mmdc -i timeline.mmd -o timeline.svg -s 2

# 时间线示例（timeline.mmd）：
echo 'timeline
    title 事故时间线 INC-20260724
    14:03 : 告警触发 error_rate>1%
    14:05 : oncall 确认
    14:07 : 开始回滚
    14:12 : 回滚完成
    14:15 : 服务恢复' > timeline.mmd

# 在 CI 中渲染时间线
mmdc -i timeline.mmd -o timeline.png -b white
```

---


---
