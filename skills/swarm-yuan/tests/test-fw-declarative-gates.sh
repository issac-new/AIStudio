#!/usr/bin/env bash
# test-fw-declarative-gates.sh — 横向清剿轮四门禁双态测试（声明式字符串耦合防线）
# 覆盖：kafka topic 配对 / rabbitmq 队列配对（含原生 basicPublish）/ jpa JPQL 实体校验 /
#       django 迁移漂移。每门禁两态：violation 命中 + compliant 不误报。
# 这些场景不进 tests/fixtures/<fw>/（避免扰动既有 fixture 语义），集中于此构造最小项目。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
TMP="$(mktemp -d /tmp/fwdg.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 构造一个"目标技能骨架"（precheck + gates 三件套 + 注入框架片段）并实跑 --framework
# 用法：mk_skill <proj_dir> <fw1> <fw2...>；输出写到 $RUNOUT
RUNOUT=""
mk_skill() {
  local proj="$1"; shift
  local sk="$TMP/skill-$$_$RANDOM"
  mkdir -p "$sk/scripts"
  cp "$BASE/assets/precheck.sh" "$sk/scripts/"
  for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
    [[ -f "$BASE/assets/$_gf" ]] && cp "$BASE/assets/$_gf" "$sk/scripts/$_gf"
  done
  {
    echo "PROJECT_DIR=\"$proj\""
    echo "ACTIVE_FRAMEWORKS=($*)"
    case " $* " in
      *" kafka "*)      echo "KAFKA_SRC_GLOBS=(\"$proj/**/*.java\")" ;;
    esac
    case " $* " in
      *" rabbitmq "*)   echo "RABBITMQ_SRC_GLOBS=(\"$proj/**/*.java\")" ;;
    esac
    case " $* " in
      *" spring-data-jpa "*) echo "SPRINGJPA_SRC_GLOBS=(\"$proj/**/*.java\")" ;;
    esac
    case " $* " in
      *" django "*)     echo "DJANGO_SRC_GLOBS=(\"$proj/**/*.py\")" ;;
    esac
  } > "$sk/scripts/precheck.conf"
  bash "$BASE/scripts/generate-skill.sh" --inject-frameworks "$sk" >/dev/null 2>&1
  RUNOUT="$(cd "$proj" && bash "$sk/scripts/precheck.sh" --framework 2>&1 || true)"
}

# ============ 态 1：kafka topic 配对 ============
P="$TMP/k1"; mkdir -p "$P/src"
cat > "$P/src/Producer.java" <<'EOF'
public class Producer {
    void go(org.springframework.kafka.core.KafkaTemplate<String,String> t) {
        t.send("order-events", "p");
        t.send("audit-events", "a");
    }
}
EOF
cat > "$P/src/Consumer.java" <<'EOF'
public class Consumer {
    @org.springframework.kafka.annotation.KafkaListener(topics = "order-events", groupId = "g")
    void on(String m) {}
}
EOF
mk_skill "$P" kafka
echo "$RUNOUT" | grep -q 'fw_kafka_topic_pair' && echo "$RUNOUT" | grep -q 'audit-events' \
  && ok "态1 kafka 单边 topic（audit-events 仅生产）warn 命中" \
  || bad "态1 未检出单边 topic: $(echo "$RUNOUT" | grep topic_pair)"
echo "$RUNOUT" | grep -q 'order-events' && echo "$RUNOUT" | grep 'topic_pair' | grep -q '仅消费无生产' \
  && bad "态1 已配对 topic 被误报" || ok "态1 已配对 topic（order-events）不误报"

# ============ 态 2：rabbitmq 队列配对（原生 basicPublish + convertAndSend） ============
P="$TMP/r1"; mkdir -p "$P/src"
cat > "$P/src/Pub.java" <<'EOF'
public class Pub {
    void go(com.rabbitmq.client.Channel ch, org.springframework.amqp.rabbit.core.RabbitTemplate rt) throws Exception {
        ch.basicPublish("", "orders", null, null);
        rt.convertAndSend("audit-q", "a");
    }
}
EOF
cat > "$P/src/Cons.java" <<'EOF'
public class Cons {
    @org.springframework.amqp.rabbit.annotation.RabbitListener(queues = "orders")
    void on(String m) {}
}
EOF
mk_skill "$P" rabbitmq
echo "$RUNOUT" | grep -q 'fw_rabbit_endpoint_pair' && echo "$RUNOUT" | grep -q 'audit-q' \
  && ok "态2 rabbitmq 单边队列（audit-q 仅生产，basicPublish/orders 配对）warn 命中" \
  || bad "态2 未检出单边队列: $(echo "$RUNOUT" | grep endpoint_pair)"
echo "$RUNOUT" | grep 'endpoint_pair' | grep -qE '仅监听无生产.*orders' \
  && bad "态2 已配对队列被误报" || ok "态2 已配对队列（orders）不误报"

# ============ 态 3：jpa JPQL 实体失配 ============
P="$TMP/j1"; mkdir -p "$P/src"
cat > "$P/src/Order.java" <<'EOF'
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
@Entity
public class Order { @Id private Long id; }
EOF
cat > "$P/src/AuditRepo.java" <<'EOF'
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AuditRepo extends JpaRepository<Order, Long> {
    @Query("select o from OrderRecord o where o.id = ?1")
    Order findOne(Long id);
}
EOF
mk_skill "$P" spring-data-jpa
echo "$RUNOUT" | grep -q 'fw_jpa_jpql_entity' && echo "$RUNOUT" | grep -q 'OrderRecord' \
  && ok "态3 JPQL 失配实体（OrderRecord 无 .java）warn 命中" \
  || bad "态3 未检出失配实体: $(echo "$RUNOUT" | grep jpql)"

# 态 3b：JPQL 实体匹配 → 不误报
P="$TMP/j2"; mkdir -p "$P/src"
cp "$TMP/j1/src/Order.java" "$P/src/"
cat > "$P/src/OrderRepo.java" <<'EOF'
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
public interface OrderRepo extends JpaRepository<Order, Long> {
    @Query("select o from Order o where o.id = ?1")
    Order findOne(Long id);
}
EOF
mk_skill "$P" spring-data-jpa
echo "$RUNOUT" | grep 'fw_jpa_jpql_entity' | grep -qE '均可定位|无 @Query' \
  && ok "态3b JPQL 实体匹配 pass（不误报）" || bad "态3b 匹配场景误报: $(echo "$RUNOUT" | grep jpql)"

# ============ 态 4：django 迁移漂移 ============
P="$TMP/d1"; mkdir -p "$P/shop"
cat > "$P/shop/models.py" <<'EOF'
from django.db import models
class Order(models.Model):
    status = models.CharField(max_length=20)
EOF
mk_skill "$P" django
echo "$RUNOUT" | grep -q 'fw_django_migration_drift' && echo "$RUNOUT" | grep -q '0 迁移文件' \
  && ok "态4 django 有模型零迁移 warn 命中" \
  || bad "态4 未检出零迁移: $(echo "$RUNOUT" | grep migration_drift)"

# 态 4b：有迁移 → pass 不误报
P="$TMP/d2"; mkdir -p "$P/shop/migrations"
cp "$TMP/d1/shop/models.py" "$P/shop/"
cat > "$P/shop/migrations/0001_initial.py" <<'EOF'
from django.db import migrations
class Migration(migrations.Migration):
    dependencies = []
    operations = []
EOF
mk_skill "$P" django
echo "$RUNOUT" | grep 'fw_django_migration_drift' | grep -qE '配 .* 迁移文件' \
  && ok "态4b 有迁移 pass（不误报）" || bad "态4b 有迁移仍报: $(echo "$RUNOUT" | grep migration_drift)"

[[ $FAIL -eq 0 ]] && { echo "PASS test-fw-declarative-gates"; exit 0; } || { echo "FAIL test-fw-declarative-gates" >&2; exit 1; }
