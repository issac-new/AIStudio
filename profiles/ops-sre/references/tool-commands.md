## 常用工具命令

### Prometheus / Grafana

```bash
# 检查 Prometheus 目标状态
curl -sf http://prometheus:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# 验证 PromQL 查询
curl -sf -G http://prometheus:9090/api/v1/query \
  --data-urlencode 'query=rate(http_requests_total{status=~"5.."}[5m])' | jq '.data.result'

# 检查告警规则
curl -sf http://prometheus:9090/api/v1/rules | jq '.data.groups[].rules[] | {name: .name, state: .state}'

# Grafana dashboard 导出
curl -sf http://grafana:3000/api/dashboards/uid/<uid> | jq '.dashboard'
```

### Kubernetes 可观测性

```bash
# 查看 Prometheus Operator 状态
kubectl get prometheus,alertmanager,servicemonitor -A

# 查看 Pod 资源用量
kubectl top pods -n <namespace> --sort-by=cpu

# 查看最近事件（排障首选）
kubectl get events --sort-by=.lastTimestamp -n <namespace>

# 查看服务端点
kubectl get endpoints <svc-name> -n <namespace>
```

### Toil 自动化验证

```bash
# 运行 runbook 脚本（dry-run 优先）
python3 scripts/runbook_<name>.py --dry-run

# 检查自动化覆盖率
grep -rl "TODO: automate" runbooks/  # 待自动化的手动步骤

# 测试告警 runbook
python3 scripts/test_alert_routing.py --alert-name "<alert>"
```

> 所有 SLO/告警/监控变更部署后必须验证指标可见、告警可触发，贴真实输出。没有可观测性的优化是赌博。

### 2. 混沌工程

**Chaos Mesh**

```bash
# 安装 Chaos Mesh（通过 Helm）
helm repo add chaos-mesh https://charts.chaos-mesh.org
helm install chaos-mesh chaos-mesh/chaos-mesh -n=chaos-mesh --create-namespace

# 注入 Pod 故障（删除指定 Pod）
kubectl apply -f - <<EOF
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: pod-kill-example
  namespace: chaos-mesh
spec:
  action: pod-kill
  mode: one
  selector:
    namespaces: [default]
    labelSelectors:
      app: svc-a
  duration: "60s"
EOF

# 验证故障注入效果
kubectl get pods -n default -l app=svc-a
kubectl describe podchaos pod-kill-example -n chaos-mesh

# 清除实验
kubectl delete -f chaos-experiment.yaml
```

**Litmus（混沌工程平台）**

```bash
# 安装 Litmus
kubectl apply -f https://litmuschaos.github.io/litmus/litmus-operator-v1.13.0.yaml

# 列出可用混沌实验
kubectl get chaosexperiments -n litmus

# 运行 Pod 删除实验
kubectl apply -f - <<EOF
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: engine-nginx
  namespace: default
spec:
  appinfo:
    appns: default
    applabel: app=svc-a
  experiments:
    - name: pod-delete
      spec:
        probe:
          - name: health-check
            type: httpProbe
            httpProbe/inputs:
              url: http://svc-a:8080/health
              expectedStatusCode: 200
EOF

# 查看实验状态
kubectl describe chaosengine engine-nginx -n default
```

### 3. Prometheus 高级工具

**promtool（Prometheus CLI）**

```bash
# 检查规则语法
promtool check rules prometheus-rules.yaml

# 检查配置文件语法
promtool check config prometheus.yml

# 调试 PromQL 查询
promtool query instant http://prometheus:9090 'rate(http_requests_total[5m])'

# 调试范围查询
promtool query range http://prometheus:9090 \
  'rate(http_requests_total[5m])' \
  --start=2024-01-01T00:00:00Z --end=2024-01-02T00:00:00Z --step=1m

# 分析 TSDB 状态
promtool tsdb analyze /data/prometheus/db

# TSDB 统计
promtool tsdb describe /data/prometheus/db
```

**Grafana CLI**

```bash
# 导出 Dashboard（JSON）
grafana-cli --homepath /usr/share/grafana admin export-dashboards

# 通过 API 导出指定 Dashboard
curl -sf http://grafana:3000/api/dashboards/uid/<uid> | jq '.dashboard' > dashboard.json

# 导入 Dashboard（通过 API）
curl -sf -X POST http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @dashboard.json

# 安装插件
grafana-cli plugins install grafana-piechart-panel

# 列出已安装插件
grafana-cli plugins ls

# 重置管理员密码
grafana-cli admin reset-admin-password <new-password>
```

### 4. 分布式追踪 CLI

**Tempo CLI**

```bash
# 查询 Trace（按 Trace ID）
tempo-cli query trace <trace-id> --tempo-host http://tempo:3200

# 搜索 Trace（按标签）
tempo-cli search --host http://tempo:3200 \
  --query '{service.name="svc-a"}'

# 查看 Tempo 状态
tempo-cli status --host http://tempo:3200
```

**Loki / LogCLI（日志查询）**

```bash
# 安装 logcli
brew install logcli

# 登录 Loki
logcli --addr http://loki:3100 --tls-skip-verify

# 查询日志（LogQL）
logcli query '{job="svc-a"} |= "error"'

# 实时跟踪日志
logcli query '{job="svc-a"}' --tail

# 指定时间范围
logcli query '{job="svc-a"}' --from="2024-01-01T00:00:00Z" --to="2024-01-02T00:00:00Z"

# 统计日志量
logcli series '{job="svc-a"}' --analyze
```

**Jaeger CLI**

```bash
# 查询 Trace
jaeger-cli query --service svc-a --limit 10 \
  --endpoint http://jaeger:16686

# 查看服务依赖图
jaeger-cli dependencies --endpoint http://jaeger:16686

# 通过 Jaeger API 搜索
curl -sf "http://jaeger:16686/api/traces?service=svc-a&limit=10" | jq '.data[].spans | length'
```

### 5. Prometheus Operator

```bash
# 查看 Operator 管理的资源
kubectl get prometheus,alertmanager,servicemonitor,podmonitor -A

# 创建 ServiceMonitor（自动发现目标）
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: svc-a-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: svc-a
  endpoints:
  - port: http
    interval: 15s
EOF

# 创建 PrometheusRule（告警规则）
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: svc-a-alerts
  namespace: monitoring
spec:
  groups:
  - name: svc-a
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{job="svc-a",status=~"5.."}[5m]) > 0.01
      for: 5m
      labels:
        severity: critical
EOF

# 查看自定义告警规则
kubectl get prometheusrule -A

# 检查 ServiceMonitor 目标发现状态
kubectl describe servicemonitor svc-a-monitor -n monitoring
```

---


---
