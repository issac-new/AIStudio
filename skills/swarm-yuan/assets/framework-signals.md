<!-- 由 scripts/gen-framework-index.sh 生成维护，手改会被覆盖 -->
# 框架信号索引（81 个框架）

| ruleset_id | 信号类型 | 模式 | 置信度 |
|------------|---------|------|-------|
| android | 文件 | `build.gradle(.kts)` 含 `com.android.application` 插件 | 高（file 类型信号；detect-frameworks.sh 不支持 file 探测，须手动 ACTIVE_FRAMEWORKS） |
| android | 文件 | `AndroidManifest.xml`（`app/src/main/` 下） | 高（Android 工程专属清单） |
| android | 文件 | `settings.gradle` + `gradle.properties` + `app/` 模块目录结构 | 中（目录结构组合） |
| android | 配置 | 源码含 `import android.` / `import androidx.` | 高（平台专属导入） |
| android | 配置 | `local.properties` 含 `sdk.dir`（Android SDK 路径） | 中（本地环境信号） |
| angular | 依赖 | `@angular/core` / `@angular/common` / `@angular/router` / `@angular/forms` / `rxjs`（package.json dependencies） | 高 |
| angular | 文件 | `**/*.component.ts` / `**/*.service.ts` / `**/*.module.ts` / `angular.json` / `**/*.spec.ts` | 高 |
| angular | 装饰器 | `@Component` / `@Injectable` / `@Directive` / `@Pipe` / `@NgModule` / `@Input` / `@Output` | 高 |
| angular | 代码 | `signal(` / `computed(` / `effect(` / `ChangeDetectionStrategy.OnPush` / `takeUntilDestroyed(` / `AsyncPipe` | 高 |
| angular | 配置 | `angular.json` / `tsconfig.json` 的 `strict` 模式 / `bootstrapApplication(` | 高 |
| antd | 依赖 | `antd` 包（package.json dependencies）/ `@ant-design/icons` / `unplugin` 配 AntdResolver | 高 |
| antd | 文件 | `**/*.tsx` / `**/*.jsx` 含 `<Button` / `<Table` / `<Form`（ant 组件 PascalCase） | 高 |
| antd | 代码 | `from 'antd'` / `App.useApp(` / `useForm(` / `ConfigProvider` / `message.success(` | 高 |
| antd | 配置 | `vite.config.*` / `webpack.config.*` 含 `AntdResolver` / `babel-plugin-import` | 中 |
| c-cpp | 文件 | `CMakeLists.txt` 或 `Makefile` | 高 |
| c-cpp | 文件 | `*.c` / `*.cpp` / `*.h` / `*.hpp` | 高 |
| c-cpp | 依赖 | `*.cpp` 含 `#include <iostream>` | 中 |
| cargo | 文件 | `**/Cargo.toml` | 高（Cargo 工程清单，存在即激活） |
| cargo | 文件 | `**/Cargo.lock` | 高（依赖锁文件，存在即激活） |
| cargo | 文件 | `**/src/main.rs` / `**/src/lib.rs` | 中（Rust 入口，需组合 Cargo.toml 判定） |
| cargo | 文件 | `**/*.rs`（含 src/） | 中（Rust 源码，需组合 Cargo.toml） |
| cargo | 配置 | `[package]` / `[dependencies]` / `[[bin]]` TOML 节 | 高 |
| cargo | 代码 | `use std::` / `fn main()` / `pub fn` / `impl` / `mod` | 中（Rust 语法特征） |
| celery | 依赖 | celery / celery[redis] / celery[sqs] / kombu | 高 |
| celery | 注解 | @shared_task / @app.task / @task | 高 |
| celery | 文件 | celery.py / celeryconfig.py / tasks.py | 中 |
| celery | 配置 | CELERY_BROKER_URL / CELERY_RESULT_BACKEND / task_routes / beat_schedule | 高 |
| dameng | 依赖 | `com.dameng:DmJdbcDriver18` / `Dm8JdbcDriver18` / `DmDialect-for-hibernate*` / `dm-python` / `sqlalchemy-dm` | 高 |
| dameng | 配置 | `jdbc:dm://` / `dm.jdbc.driver.DmDriver` / 5236 端口数据源 | 高 |
| dameng | 文件 | `**/dm.ini` / `**/dm_svc.conf` / DDL 含 `IDENTITY(` 或 `STORAGE(` 子句 | 中（需排除他用） |
| dameng | 代码 | `ROWNUM` / `LISTAGG(` / `SET IDENTITY_INSERT` / `NEXTVAL(` / `SYSDATE` | 中（Oracle 系同源，需组合信号） |
| dameng | 注解/方言 | `org.hibernate.dialect.DmDialect` / `DmDialect-for-hibernate` | 高 |
| django | 依赖 | `Django` / `django`（requirements.txt / pyproject.toml / Pipfile） | 高 |
| django | 文件 | `**/manage.py` / `**/settings.py` / `**/wsgi.py` / `**/asgi.py` | 高 |
| django | 代码 | `from django.` / `import django` / `django.db.models` / `models.Model` | 高 |
| django | 配置 | `SECRET_KEY` / `MIDDLEWARE` / `INSTALLED_APPS` / `DATABASES` / `ALLOWED_HOSTS` | 高 |
| django | 目录结构 | `**/migrations/`（含 `__init__.py` 与数字前缀迁移文件） | 中（需组合信号） |
| dockerfile | 文件 | `**/Dockerfile` / `**/Dockerfile.*` / `**/*.dockerfile` | 高（Dockerfile 命名约定，存在即激活） |
| dockerfile | 文件 | `**/.dockerignore` | 中（容器构建上下文排除清单，组合 Dockerfile 判定） |
| dockerfile | 文件 | `**/docker-compose*.y*ml` 中含 `build:` 段 | 中（编排文件引用 Dockerfile，组合判定） |
| dockerfile | 配置 | `FROM ...` / `RUN ...` / `COPY ...` / `ENTRYPOINT ...` 指令行 | 高（Dockerfile 指令特征） |
| dockerfile | 配置 | `# syntax=docker/dockerfile:` 解析器指令 | 高（BuildKit 解析器前缀，BuildKit 工程特征） |
| doris | 依赖 | `org.apache.doris:doris-fe-common` / `doris-spark-connector` / `doris-flink-connector` / `mysql-connector-java`（Doris 兼容 MySQL 协议） | 高 |
| doris | 配置 | `fe.conf` 含 `priority_networks` / `meta_dir`；`be.conf` 含 `storage_root_path` / `webserver_port` | 高 |
| doris | 代码 | `DorisStreamLoadClient` / `DorisSource` / `DorisSink` / `insert into` / `SELECT` from `information_schema` | 高 |
| doris | SQL | `DISTRIBUTED BY HASH` / `PROPERTIES("replication_num"` / `ROLLUP` / `MATERIALIZED VIEW` / `COLOCATE WITH` | 高 |
| doris | 文件 | `fe.conf` / `be.conf` / `*.sql` 含 `CREATE TABLE` Doris 语法 | 中 |
| dotnet | 文件 | `*.csproj` 含 `Microsoft.NET.Sdk` | 高 |
| dotnet | 文件 | `Program.cs` 或 `Startup.cs` | 中 |
| dotnet | 依赖 | `*.cs` 含 `using Microsoft.AspNetCore` | 高 |
| druid | 依赖 | `com.alibaba:druid` / `com.alibaba:druid-spring-boot-starter` / `com.alibaba:druid-spring-boot-3-starter` | 高 |
| druid | 配置 | `spring.datasource.druid.*` / `druid.initial-size` / `druid.max-active` / `druid.filters` / `druid.filter.stat.*` / `druid.filter.wall.*` | 高 |
| druid | 代码 | `DruidDataSource` / `DruidDataSourceBuilder` / `DruidFilterConfiguration` / `StatViewServlet` / `WebStatFilter` | 高 |
| druid | XML | `<bean.*DruidDataSource` / `<property name="filters" value="stat,wall"` | 中（Spring XML 配置） |
| druid | 注解 | `@DruidStat` / `@StatFilter` | 低（非官方，部分封装库） |
| dubbo | 依赖 | `org.apache.dubbo:dubbo` / `dubbo-spring-boot-starter` / `dubbo-registry-nacos` / `dubbo-registry-zookeeper` / `dubbo-rpc-triple` | 高 |
| dubbo | 注解 | `@DubboService` / `@DubboReference` / `@EnableDubbo` / `@DubboMethod` | 高 |
| dubbo | 文件 | `**/dubbo.properties` / `**/dubbo.xml` / `**/dubbo-provider.xml` / `**/dubbo-consumer.xml` | 中（需排除他用） |
| dubbo | 配置 | `dubbo.application.*` / `dubbo.registry.*` / `dubbo.protocol.*` / `dubbo.consumer.*` / `dubbo.provider.*` / `dubbo.qos.*` | 高 |
| dubbo | 代码 | `RpcContext` / `GenericService` / `org.apache.dubbo.config.annotation` | 高 |
| elasticjob | 依赖 | `org.apache.shardingsphere.elasticjob:elasticjob-lite-core` / `elasticjob-lite-spring-boot-starter` / `elasticjob-error-handler-*` / `elasticjob-tracing-rdb` | 高 |
| elasticjob | 代码 | `implements SimpleJob` / `implements DataflowJob` / `ShardingContext` / `JobConfiguration` / `ScheduleJobBootstrap` | 高 |
| elasticjob | 配置 | `elasticjob.reg-center.*` / `elasticjob.jobs.*` / `elasticjob.tracing.*` | 高 |
| elasticjob | 注解 | `@ElasticJobConfiguration`（社区封装，待验证官方性） | 低（非官方标准注解，仅辅助） |
| elasticjob | 文件 | `**/elasticjob*.yml` / ZK 命名空间 `**/job` 节点 | 低 |
| elasticsearch | 依赖 | `co.elastic.clients:elasticsearch-java` / `org.elasticsearch.client:elasticsearch-rest-high-level-client` / `org.springframework.data:spring-data-elasticsearch` | 高 |
| elasticsearch | 配置 | `spring.elasticsearch.*` / `elasticsearch.hosts` / `index.max_result_window` / `index.refresh_interval` | 高 |
| elasticsearch | 代码 | `ElasticsearchClient` / `RestClient` / `RestHighLevelClient` / `SearchRequest` / `BulkRequest` / `@Document` | 高 |
| elasticsearch | 注解 | `@Document` / `@Field`（spring-data-elasticsearch） | 中（需排除其他同名注解） |
| elasticsearch | 文件 | `**/elasticsearch*.yml` / `**/*mapping*.json` 中含 `"mappings"` | 中 |
| element | 依赖 | `element-plus` 包（package.json dependencies）/ `@element-plus/icons-vue` / `unplugin-vue-components` 配 ElementPlusResolver | 高 |
| element | 文件 | `**/*.vue` 含 `el-` 前缀组件 / `element-plus.config.*` | 高 |
| element | 代码 | `import .* from 'element-plus'` / `ElMessage(` / `ElNotification(` / `ElMessageBox(` / `<el-form` / `<el-table` | 高 |
| element | 配置 | `vite.config.*` 含 `ElementPlusResolver` / `@element-plus` 自动导入配置 | 中 |
| express | 依赖 | `package.json` dependencies 含 `"express"` / `"express-validator"` / `"helmet"` | 高 |
| express | 代码 | `require('express')` / `from 'express'` / `express()` / `express.Router(` / `app.listen(` | 高 |
| express | 文件 | `**/app.js` / `**/server.js`（含 express 引用）/ `**/routes/**/*.js` | 中（需组合依赖信号） |
| express | 配置 | `NODE_ENV` / `PORT` 环境变量 + express 中间件链 `app.use(` | 中 |
| fastapi | 依赖 | `fastapi` / `uvicorn`（requirements.txt / pyproject.toml） | 高 |
| fastapi | 代码 | `from fastapi import` / `FastAPI(` / `APIRouter(` / `Depends(` | 高 |
| fastapi | 代码 | `from pydantic import` / `BaseModel` / `field_validator` | 中（pydantic 可独立于 FastAPI 使用） |
| fastapi | 脚本调用 | `uvicorn .* :app` / `fastapi run` | 高 |
| fastapi | 配置 | `allow_origins` / `CORSMiddleware` / `response_model` | 中 |
| fastify | 依赖 | `package.json` 含 `"fastify"` / `"@fastify/cors"` / `"@fastify/rate-limit"` / `"@fastify/auth"` / `"@fastify/swagger"` / `"fastify-plugin"` | 高 |
| fastify | 代码 | `require('fastify')` / `from 'fastify'` / `fastify.register(` / `fastify.addHook(` / `fastify.decorate` | 高 |
| fastify | 配置 | `fastify({ logger: ... })` 初始化 / `setErrorHandler` / `setNotFoundHandler` | 高 |
| fastify | 文件 | `**/plugins/*.js`（fastify 插件目录约定） | 中（需排除他用，须组合依赖信号） |
| flask | 依赖 | `Flask` / `flask`（requirements.txt / pyproject.toml） | 高 |
| flask | 代码 | `from flask import` / `Flask(__name__)` / `@app.route` / `Blueprint(` | 高 |
| flask | 文件 | `**/app.py`（含 Flask 实例化） / `**/wsgi.py` / `**/create_app` 工厂 | 中（需组合信号） |
| flask | 配置 | `SECRET_KEY` / `app.config` / `FLASK_APP` / `SQLALCHEMY_DATABASE_URI` | 高 |
| flask | 脚本调用 | `flask run` / `gunicorn .* :app` | 中 |
| flink | 依赖 | `org.apache.flink:flink-streaming-java` / `flink-table-api-java-bridge` / `flink-connector-*` / `org.apache.flink.cdc:flink-cdc-*` / `com.ververica:flink-connector-*` | 高 |
| flink | 注解/代码 | `StreamExecutionEnvironment` / `StreamTableEnvironment` / `DataStream` / `WatermarkStrategy` / `CheckpointConfig` | 高 |
| flink | 文件 | `**/flink-conf.yaml` / `**/flink-conf.yml` / `**/sql-client-defaults.yaml` / `**/conf/flink-conf.yaml` | 中（须排除他用） |
| flink | 配置 | `execution.checkpointing.*` / `state.backend.*` / `restart-strategy.*` / `pipeline.jars` / `table.*` / `high-availability.*` | 高 |
| flink | 代码 | `enableCheckpointing` / `assignTimestampsAndWatermarks` / `RestartStrategy` / `KeyedState` / `ValueState` / `CEP.pattern` | 高 |
| flink | CDC | `flink-cdc.yaml`（YAML pipeline：`source:`/`sink:` + `pipeline:` 节点）/ `MySqlSource` / `FlinkSourceFunction` | 高 |
| flutter | 文件 | `pubspec.yaml` 存在（含 `flutter:` sdk 段） | 高（file 类型信号；detect-frameworks.sh 不支持 file 探测，须手动 ACTIVE_FRAMEWORKS） |
| flutter | 依赖 | pubspec.yaml dependencies 含 `flutter` / `flutter_test` | 高 |
| flutter | 文件 | `lib/main.dart` 入口 + `analysis_options.yaml` | 中（目录结构组合） |
| flutter | 配置 | `import 'package:flutter/material.dart'` / `package:flutter/cupertino.dart` | 高（框架专属导入） |
| flutter | 文件 | `android/app/build.gradle` + `ios/Podfile` 双端工程并存 | 低（仅作辅助） |
| gin | 依赖 | `github.com/gin-gonic/gin` / `github.com/gin-contrib/...`（gzip/cors/sessions/jwt） | 高 |
| gin | 注解 | 无（Gin 不依赖注解，以 import + API 调用识别） | — |
| gin | 文件 | `**/go.mod` 含 `gin-gonic/gin` | 高 |
| gin | 配置 | `GIN_MODE` 环境变量 / `gin.SetMode(` | 中 |
| gin | 代码 | `gin.Engine` / `gin.Context` / `gin.Default()` / `gin.New()` / `c.JSON(` / `c.Abort(` / `c.Next()` / `engine.Run(` | 高 |
| gorm | 依赖 | `gorm.io/gorm` / `gorm.io/driver/mysql` / `gorm.io/driver/postgres` / `gorm.io/driver/sqlite` / `gorm.io/driver/sqlserver` | 高 |
| gorm | 文件 | `**/go.mod` 含 `gorm.io/gorm` | 高 |
| gorm | 配置 | 无独立配置文件（DSN 走代码/env） | — |
| gorm | 代码 | `gorm.Open(` / `gorm.DB` / `db.AutoMigrate(` / `db.Preload(` / `db.Transaction(` / `db.Model(` / `db.Create(` / `db.First(` / `db.Find(` / `gorm.Model` / `gorm.DeletedAt` / `errors.Is(err, gorm.ErrRecordNotFound)` | 高 |
| harmonyos | 文件 | `*.ets` / `*.ts`（ArkTS）/ `CMakeLists.txt` / `*.cpp` / `*.c` / `*.h`（NDK native）/ `module.json5` / `app.json5` | 高 |
| harmonyos | 依赖 | `ohos` npm scope / `@ohos` 包 / `libace_napi.z.so` / `native_buffer` / `napi` | 高 |
| harmonyos | 配置 | `module.json5` 含 `requestPermissions` / `abilities` / `extensionAbilities` | 高 |
| harmonyos | 代码 | `napi_*` / `NAPI` / `ArkTSToNative` / `Native API` / `@Entry` / `@Component` / `AbilityStage` / `onCreate` | 高 |
| harmonyos | 目录 | `src/main/ets/` / `src/main/cpp/` / `src/main/resources/` / `entry/src/` | 中 |
| hive | 依赖 | `org.apache.hive:hive-exec` / `hive-jdbc` / `hive-metastore` / `hive-service` | 高 |
| hive | 配置 | `hive-site.xml` 含 `javax.jdo.option.ConnectionURL` / `hive.metastore.uris` / `hive.execution.engine` | 高 |
| hive | 代码 | `HiveConf` / `HiveDriver` / `HiveMetastoreClient` / `IMetaStoreClient` / `TezSession` | 高 |
| hive | SQL/HQL | `CREATE TABLE` 含 `PARTITIONED BY` / `CLUSTERED BY ... INTO ... BUCKETS` / `STORED AS ORC` / `TBLPROPERTIES('transactional'='true')` | 高 |
| hive | 文件 | `hive-site.xml` / `hive-env.sh` / `*.hql` / `*.q` / `beeline` 脚本 | 中 |
| ios-swiftui | 文件 | `*.swift` 含 `import SwiftUI` | 高 |
| ios-swiftui | 文件 | `*.xcodeproj` 或 `Package.swift` | 高 |
| ios-swiftui | 依赖 | `import UIKit` + `import SwiftUI` | 中 |
| jackson | 依赖 | `com.fasterxml.jackson.core:jackson-databind` / `com.fasterxml.jackson.module:jackson-module-parameter-names` / `com.fasterxml.jackson.datatype:jackson-datatype-jsr310` / `tools.jackson.core:jackson-databind`（3.x） | 高 |
| jackson | 注解 | `@JsonProperty` / `@JsonIgnore` / `@JsonFormat` / `@JsonTypeInfo` / `@JsonSubTypes` / `@JsonInclude` / `@JsonCreator` / `@JsonView` / `@JsonIgnoreProperties` | 高 |
| jackson | 文件 | `**/dto/**/*.java` 含 Jackson 注解 / `**/*ObjectMapper*.java` | 中（需组合注解信号） |
| jackson | 配置 | `spring.jackson.*`（serialization-inclusion / date-format / time-zone / default-property-inclusion） | 高 |
| jackson | 代码 | `new ObjectMapper(` / `JsonMapper.builder()` / `registerModule(new JavaTimeModule` / `ObjectMapper.readValue` | 高 |
| jest-vitest | 依赖 | `vitest` 包（package.json devDependencies）/ `@vitest/coverage-v8` / `@vitest/ui` / `jest` | 高 |
| jest-vitest | 文件 | `vitest.config.ts` / `vitest.config.js` / `jest.config.*` / `vite.config.*` 含 `test:` | 高 |
| jest-vitest | 代码 | `from 'vitest'` / `import { describe, it, expect, vi }` / `vi.fn(` / `vi.mock(` / `jest.fn(` | 高 |
| jest-vitest | 测试文件 | `**/__tests__/**/*.test.ts` / `**/*.spec.ts` / `**/*.bench.ts` | 高 |
| junit5-mockito | 依赖 | `org.junit.jupiter:junit-jupiter` / `org.mockito:mockito-core` / `org.mockito:mockito-junit-jupiter` / `org.springframework.boot:spring-boot-starter-test` / `org.testcontainers:junit-jupiter` | 高 |
| junit5-mockito | 注解 | `@Test` / `@BeforeEach` / `@BeforeAll` / `@AfterEach` / `@ParameterizedTest` / `@ValueSource` / `@MethodSource` / `@ExtendWith` / `@Mock` / `@Spy` / `@InjectMocks` / `@MockBean` / `@MockitoBean` / `@Testcontainers` / `@Disabled` / `@DisplayName` / `@Timeout` | 高 |
| junit5-mockito | 文件 | `src/test/java/**/*Test.java` / `**/*Tests.java` / `**/*IT.java` | 高 |
| junit5-mockito | 配置 | `junit-platform.properties` / `mockito-extensions/org.mockito.plugins.MockMaker` | 中 |
| junit5-mockito | 代码 | `import org.junit.jupiter.api` / `import org.mockito` / `Mockito.when(` / `Mockito.verify(` | 高 |
| kafka | 依赖 | `org.apache.kafka:kafka-clients` / `org.springframework.kafka:spring-kafka` / `spring-kafka-test` / `io.confluent:kafka-avro-serializer` | 高 |
| kafka | 注解 | `@KafkaListener` / `@RetryableTopic` / `@KafkaHandler` / `@DltHandler` | 高 |
| kafka | 配置 | `spring.kafka.*` / `bootstrap.servers` / `bootstrap-servers` / `group.id` / `enable.auto.commit` | 高 |
| kafka | 代码 | `KafkaTemplate` / `ProducerRecord` / `KafkaProducer` / `KafkaConsumer` / `ConsumerFactory` / `DeadLetterPublishingRecoverer` | 高 |
| kafka | 文件 | `**/docker-compose*.yml` 含 `kafka:` / `**/schema-registry*.yml` | 中（需排除仅部署描述） |
| kettle | 依赖 | `pentaho-kettle:kettle-core` / `kettle-engine` / `pentaho:pdi` | 高 |
| kettle | 注解 | `@Step` / `@JobEntry`（Kettle 插件注解） | 中（仅插件开发项目出现） |
| kettle | 文件 | `**/*.kjb` / `**/*.ktr` / `kettle.properties` / `carte-config*.xml` / `slave-server-config*.xml` / `pwd/kettle.pwd` | 高 |
| kettle | 配置 | `<transformation>` / `<job>` 根元素 / `<connection>` 块 / `<transversion>` | 高 |
| kettle | 脚本调用 | `pan.sh` / `kitchen.sh` / `carte.sh` / `spoon.sh` 命令行调用 | 高 |
| koa | 依赖 | `package.json` dependencies 含 `"koa"` / `"@koa/router"` / `"koa-bodyparser"` / `"koa-helmet"` / `"socket.io"` | 高 |
| koa | 代码 | `new Koa()` / `require('koa')` / `await next()` / `ctx.body =` / `ctx.throw(` | 高 |
| koa | 文件 | `**/app.js` / `**/server.js`（含 koa 引用）/ `**/routes/**/*.js`（含 Router） | 中（需组合依赖信号） |
| koa | 配置 | `PORT` + 中间件链 `app.use(` 且含 `ctx` 参数签名 | 中 |
| kratos | 依赖 | `github.com/go-kratos/kratos/v2`（go.mod） | 高 |
| kratos | 文件 | `**/wire.go` + `**/wire_gen.go`（wire 编译期注入对） | 高 |
| kratos | 文件 | `internal/{server,service,biz,data}/` 四层目录（kratos-layout 标准布局） | 中（需组合信号） |
| kratos | 配置 | `configs/config.yaml` + `internal/conf/*.proto`（Bootstrap 配置契约） | 中 |
| kratos | 代码 | `kratos.New(` / `http.NewServer(` / `grpc.NewServer(` / `recovery.Recovery()` / `RegisterXxxHTTPServer(` | 高 |
| kubernetes | 文件 | `**/*.yaml` / `**/*.yml`（含 k8s 清单） | 中（YAML 通用，须组合 apiVersion/kind 判定） |
| kubernetes | 文件 | `**/kustomization.yaml` / `**/Chart.yaml` | 高（Kustomize/Helm 工程特征） |
| kubernetes | 配置 | `apiVersion: apps/v1` / `kind: Deployment|StatefulSet|DaemonSet|Pod` | 高（K8s 工作负载 API 信号） |
| kubernetes | 配置 | `apiVersion: v1` + `kind: Service|ConfigMap|Secret|Namespace` | 高（K8s 原生资源） |
| kubernetes | 配置 | `apiVersion: rbac.authorization.k8s.io/v1` + `kind: Role|RoleBinding|ClusterRole` | 高（K8s RBAC） |
| kubernetes | 配置 | `apiVersion: networking.k8s.io/v1` + `kind: NetworkPolicy` / `kind: Ingress` | 高（K8s 网络资源） |
| kubernetes | 配置 | `apiVersion: policy` + `kind: PodDisruptionBudget` | 高（K8s PDB） |
| langchain | 依赖 | `langchain` / `langchain-core` / `langchain-community` / `langgraph`（requirements.txt / pyproject.toml） | 高 |
| langchain | 代码 | `from langchain` / `from langchain_core` / `from langchain_openai` / `from langgraph` | 高 |
| langchain | 代码 | `PromptTemplate(` / `ChatPromptTemplate` / `AgentExecutor` / `create_react_agent` / `StateGraph(` | 中（需与依赖信号组合） |
| langchain | 配置 | `LANGCHAIN_TRACING_V2` / `LANGSMITH_API_KEY` / `OPENAI_API_KEY` 环境变量 | 中 |
| lombok | 依赖 | `org.projectlombok:lombok` / `org.projectlombok:lombok-mapstruct-binding` | 高 |
| lombok | 注解 | `@Data` / `@Getter` / `@Setter` / `@Builder` / `@Jacksonized` / `@AllArgsConstructor` / `@NoArgsConstructor` / `@RequiredArgsConstructor` / `@Slf4j` / `@Log` / `@SneakyThrows` / `@Cleanup` / `@NonNull` / `@Value` / `@EqualsAndHashCode` / `val` / `var` | 高 |
| lombok | 配置 | `lombok.config`（含 `config.stopBubbling` / `lombok.log.fieldName` / `lombok.copyJacksonAnnotationsToAccessors` / `lombok.anyConstructor.addConstructorProperties` 等 key） | 高 |
| lombok | 代码 | `import lombok.` / `import lombok.experimental.` / `@Jacksonized` / `@SuperBuilder` / `@Accessors` / `@Locked` | 高 |
| lombok | 工具 | `java -jar lombok.jar delombok` / `lombok-maven-plugin` / `org.mapstruct:mapstruct-processor` 与 `lombok` 同 module 路径 | 中 |
| mapstruct | 依赖 | `org.mapstruct:mapstruct` / `org.mapstruct:mapstruct-processor` / `org.projectlombok:lombok-mapstruct-binding` | 高 |
| mapstruct | 注解 | `@Mapper` / `@MapperConfig` / `@Mapping` / `@MappingTarget` / `@Named` / `@InheritConfiguration` / `@InheritInverseConfiguration` / `@IterableMapping` | 高 |
| mapstruct | 配置 | `annotationProcessorPaths`（含 mapstruct-processor） / `mapstruct.defaultComponentModel` / `mapstruct.unmappedTargetPolicy` 编译参数 | 高 |
| mapstruct | 代码 | `import org.mapstruct.` / `Mappers.getMapper(` / `ReportingPolicy` / `CycleAvoidingStrategy` | 高 |
| mapstruct | 文件 | `**/mapper/**/*Mapper.java` / `**/mapstruct/**/*.java` | 中（需组合依赖信号） |
| mybatis | 依赖 | `org.mybatis:mybatis` / `org.mybatis:mybatis-spring` / `org.mybatis.spring.boot:mybatis-spring-boot-starter` / `com.baomidou:mybatis-plus` / `com.baomidou:mybatis-plus-boot-starter` | 高 |
| mybatis | 文件 | `**/resources/**/*Mapper.xml` / `**/mapper/**/*.xml` / `mybatis-config.xml` | 高 |
| mybatis | 注解 | `@Mapper` / `@MapperScan` / `@Intercepts` / `@TableLogic` / `@TableName` / `@TableId` / `@TableField` | 高 |
| mybatis | 配置 | `mybatis.mapper-locations` / `mybatis.type-aliases-package` / `mybatis-plus.global-config.db-config.*` / `mybatis-plus.global-config.enable-aggressive` | 高 |
| mybatis | 代码 | `extends BaseMapper<` / `implements TypeHandler<` / `extends MybatisPlusInterceptor` / `SqlSessionFactoryBean` / `MapperScannerConfigurer` | 高 |
| mysql | 依赖 | `mysql:mysql-connector-j` / `mysql-connector-java` / `github.com/go-sql-driver/mysql` / `mysql2`(npm) / `PyMySQL` | 高 |
| mysql | 文件 | `**/my.cnf` / `**/my.ini` / `**/schema.sql` 内含 `ENGINE=InnoDB` | 高 |
| mysql | 配置 | `jdbc:mysql://` / `spring.datasource.url.*mysql` / `[mysqld]` 配置段 | 高 |
| mysql | 代码 | `ENGINE=InnoDB` / `ALGORITHM=INSTANT` / `innodb_` 前缀参数 / `utf8mb4` | 高 |
| mysql | 服务 | `docker-compose` 含 `image: mysql:` | 中（须排除仅本地开发用途） |
| nacos | 依赖 | `com.alibaba.cloud:spring-cloud-starter-alibaba-nacos-config` / `spring-cloud-starter-alibaba-nacos-discovery` / `com.alibaba.nacos:nacos-client` / `nacos-spring-context` | 高 |
| nacos | 注解 | `@NacosValue` / `@NacosPropertySource` / `@NacosConfigListener` / `@NacosInjected` | 高 |
| nacos | 配置 | `spring.cloud.nacos.config.*` / `spring.cloud.nacos.discovery.*` / `nacos.server-addr` | 高 |
| nacos | 文件 | `**/nacos/conf/cluster.conf` / `**/application.properties`（nacos server 包内） | 中（需排除他用） |
| nacos | 代码 | `NamingService` / `ConfigService` / `NacosFactory` / `NacosConfigManager` | 高 |
| naiveui | 依赖 | `naive-ui` 包（package.json dependencies）/ `@vicons/ionicons5` 等图标包 | 高 |
| naiveui | 文件 | `**/*.vue` 含 `n-` 前缀组件 / `**/*.ts` 含 `from 'naive-ui'` | 高 |
| naiveui | 代码 | `from 'naive-ui'` / `useMessage(` / `useDialog(` / `n-config-provider` / `<n-data-table` | 高 |
| naiveui | 配置 | `vite.config.*` 含 `NaiveUiResolver` / `unplugin-vue-components` | 中 |
| nestjs | 依赖 | `package.json` dependencies 含 `"@nestjs/core"` / `"@nestjs/common"` / `"@nestjs/platform-express"` / `"@nestjs/platform-fastify"` | 高 |
| nestjs | 注解 | `@Module(` / `@Injectable(` / `@Controller(` / `@UseGuards(` / `@UseInterceptors(` / `@UsePipes(` | 高 |
| nestjs | 文件 | `**/*.module.ts` / `**/*.controller.ts` / `**/*.service.ts` / `nest-cli.json` | 高 |
| nestjs | 配置 | `tsconfig.json` 含 `emitDecoratorMetadata: true` + `experimentalDecorators: true` | 中（需组合依赖信号） |
| netty | 依赖 | `io.netty:netty-all` / `netty-buffer` / `netty-transport` / `netty-codec` / `netty-handler` / `netty-codec-http` | 高 |
| netty | 注解 | `@ChannelHandler.Sharable` / `@Sharable` | 高 |
| netty | 文件 | `**/netty/**` 包目录 / `**/*ChannelInitializer*.java` | 中（需排除仅依赖传递） |
| netty | 配置 | `ServerBootstrap` / `Bootstrap` / `NioEventLoopGroup` / `EpollEventLoopGroup` / `ChannelOption\.` | 高 |
| netty | 代码 | `ChannelInboundHandlerAdapter` / `SimpleChannelInboundHandler` / `ByteBuf` / `ChannelPipeline` / `writeAndFlush` | 高 |
| nextjs | 依赖 | `next` 包（package.json dependencies）/ `next/router` / `next/navigation` / `next/image` / `next/font` | 高 |
| nextjs | 文件 | `next.config.js` / `next.config.mjs` / `app/**/page.tsx` / `app/**/layout.tsx` / `pages/**/*.tsx`（Pages Router） | 高 |
| nextjs | 代码 | `'use client'` / `'use server'` / `next/headers` / `next/cookies` / `generateStaticParams(` / `revalidate` / `metadata` | 高 |
| nextjs | 目录 | `app/` 目录（App Router）/ `pages/` 目录（Pages Router）/ `middleware.ts` | 高 |
| nextjs | 配置 | `next.config.*` 的 `experimental.serverActions` / `images.domains` / `redirects` / `rewrites` | 高 |
| nuxt | 依赖 | `nuxt` 包（package.json devDependencies）/ `#imports` / `@nuxt/` / `nuxt.config.ts` | 高 |
| nuxt | 文件 | `nuxt.config.ts` / `app/app.vue` / `app/pages/**/*.vue` / `app/layouts/**/*.vue` / `app/middleware/**/*.ts` / `app/plugins/**/*.ts` / `app/composables/**/*.ts` | 高 |
| nuxt | 代码 | `useFetch(` / `useAsyncData(` / `useState(` / `defineNuxtPlugin(` / `defineNuxtRouteMiddleware(` / `useSeoMeta(` | 高 |
| nuxt | 配置 | `nuxt.config.ts` 的 `modules` / `runtimeConfig` / `app.head` / `nitro` | 高 |
| nuxt | 目录 | `app/`（Nuxt 4 默认 srcDir）/ `server/`（nitro 服务端）/ `public/` | 高 |
| opengauss | 依赖 | `org.opengauss:opengauss-jdbc`（pom.xml groupId/artifactId） | 高 |
| opengauss | 依赖 | `psycopg2` / `psycopg2-binary`（requirements.txt；PG 协议兼容驱动，须与配置信号组合） | 中 |
| opengauss | 配置 | `jdbc:opengauss://` / `org.opengauss.Driver` / 5432 端口数据源 | 高 |
| opengauss | 文件 | `**/pg_hba.conf` / `**/postgresql.conf` 含 `audit_trail` 等 openGauss 专属参数 | 中（PG 同源，需组合信号） |
| opengauss | 代码 | `psycopg2.connect(` / `DruidDataSource` + opengauss URL | 中 |
| opentelemetry | 依赖 | `@opentelemetry/api` / `@opentelemetry/sdk-node` / `@opentelemetry/exporter-*`（package.json） | 高 |
| opentelemetry | 依赖 | `opentelemetry-api` / `opentelemetry-sdk` / `opentelemetry-exporter-*`（requirements.txt / pyproject.toml） | 高 |
| opentelemetry | 依赖 | `go.opentelemetry.io/otel` / `go.opentelemetry.io/otel/sdk` / `go.opentelemetry.io/otel/exporters/otlp`（go.mod） | 高 |
| opentelemetry | 依赖 | `io.opentelemetry:opentelemetry-api` / `io.opentelemetry:opentelemetry-sdk` / `opentelemetry-exporter-*`（pom.xml） | 高 |
| opentelemetry | 文件 | `**/otel{,init}.{js,ts,py,go,java}` / `**/instrumentation.{js,ts,py}` | 中 |
| opentelemetry | 配置 | `OTEL_SERVICE_NAME=` / `OTEL_EXPORTER_OTLP_ENDPOINT=` 环境变量 | 中 |
| opentelemetry | 代码 | `NodeSDK` / `resource.ServiceResource` / `Resource.create(` / `trace.getTracer(` / `OTEL_EXPORTER_OTLP_ENDPOINT` | 高 |
| opentelemetry | 代码 | `tracer.startSpan(` / `span.setAttribute(` / `context.propagation` / `Baggage` / `otel.TracerProvider` | 高 |
| paimon | 依赖 | `org.apache.paimon:paimon-flink-*` / `paimon-spark-*` / `paimon-bundle` / `paimon-hive-connector` / `paimon-trino` | 高 |
| paimon | 配置 | `'connector'\s*=\s*'paimon'` / `catalog-type=paimon` / `warehouse` + `paimon` / `PAIMON` catalog 注册 | 高 |
| paimon | 文件 | `**/catalog/*.sql`（含 paimon DDL）/ `warehouse/` 目录下 `*/db.db/*/manifest/` 结构 | 中（须排除他用） |
| paimon | 配置项 | `merge-engine` / `changelog-producer` / `bucket` / `snapshot.time-retained` / `scan.mode` | 高 |
| paimon | 代码/SQL | `CREATE TABLE ... WITH ('connector'='paimon')` / `MERGE INTO`（paimon spark）/ `sys.compact` 过程调用 | 高 |
| paimon | CDC | flink-cdc YAML `sink: connector: paimon` / `PaimonPipeline` | 高 |
| php | 依赖 | composer.json require 含 `laravel/framework` / `symfony/http-foundation` / `phpunit/phpunit` / `guzzlehttp/guzzle` / `monolog/monolog` | 高 |
| php | 文件 | `composer.json` / `composer.lock` / `artisan` / `**/*.php` / `**/*.blade.php` | 高 |
| php | 注解/属性 | `#[Route(` / `->name(` / `->middleware(` / `#[Entity]` | 中 |
| php | 配置 | `.env.example` / `config/*.php` / `phpunit.xml` / composer.json `autoload.psr-4` | 中 |
| php | 脚本调用 | `composer install` / `composer update` / `php artisan` / `vendor/bin/phpunit` | 中 |
| postgresql | 依赖 | `org.postgresql:postgresql` / `github.com/lib/pq` / `pg`(npm) / `psycopg2` / `asyncpg` | 高 |
| postgresql | 文件 | `**/postgresql.conf` / `**/pg_hba.conf` / DDL 内含 `GENERATED ... AS IDENTITY` / `PARTITION BY` | 高 |
| postgresql | 配置 | `jdbc:postgresql://` / `postgres://` / `postgresql://` 数据源 URL | 高 |
| postgresql | 代码 | `jsonb` / `USING gin` / `GENERATED ALWAYS AS IDENTITY` / `RETURNING` 子句 | 高 |
| postgresql | 服务 | `docker-compose` 含 `image: postgres:` / `image: pgbouncer:` | 中（须排除仅本地开发用途） |
| prisma | 依赖 | `package.json` 含 `"prisma"` / `"@prisma/client"` / `"@prisma/adapter-*"` | 高 |
| prisma | 文件 | `**/schema.prisma` / `**/prisma/migrations/*/migration.sql` / `**/prisma.config.ts` | 高 |
| prisma | 配置 | `datasource db {` / `generator client {` / `model ` 块 | 高 |
| prisma | 代码 | `new PrismaClient(` / `prisma.$transaction(` / `prisma.$queryRaw` / `$extends(` | 高 |
| pytest | 依赖 | pytest / pytest-asyncio / pytest-xdist / pytest-cov | 高 |
| pytest | 注解 | @pytest.fixture / @pytest.mark / @pytest.mark.parametrize / @pytest.skip | 高 |
| pytest | 文件 | conftest.py / pytest.ini / pyproject.toml [tool.pytest.ini_options] | 高 |
| pytest | 配置 | pytest.ini / tox.ini [pytest] / setup.cfg [tool:pytest] | 高 |
| quartz | 依赖 | `org.quartz-scheduler:quartz` / `spring-boot-starter-quartz` / `net.javacrumbs.shedlock:shedlock-spring`（配套信号） | 高 |
| quartz | 注解 | `@Scheduled` / `@DisallowConcurrentExecution` / `@PersistJobDataAfterExecution` / `@SchedulerLock` | 高 |
| quartz | 配置 | `org.quartz.*` / `spring.quartz.*` / `QRTZ_*`（数据库表前缀） | 高 |
| quartz | 代码 | `JobBuilder` / `TriggerBuilder` / `CronScheduleBuilder` / `SchedulerFactoryBean` / `JobDetail` / `implements Job` | 高 |
| quartz | 文件 | `**/quartz.properties` / `**/tables_*.sql`（QRTZ 建表脚本） | 中（需排除仅样例文档） |
| rabbitmq | 依赖 | `org.springframework.boot:spring-boot-starter-amqp` / `org.springframework.amqp:spring-rabbit` / `com.rabbitmq:amqp-client` | 高 |
| rabbitmq | 注解 | `@RabbitListener` / `@RabbitHandler` / `@EnableRabbit` | 高 |
| rabbitmq | 配置 | `spring.rabbitmq.*` / `spring.rabbitmq.listener.*` / `publisher-confirm-type` / `x-dead-letter-exchange` / `x-queue-type` | 高 |
| rabbitmq | 代码 | `RabbitTemplate` / `ConnectionFactory` / `QueueBuilder` / `DirectExchange` / `TopicExchange` / `basicPublish` / `basicConsume` | 高 |
| rabbitmq | 文件 | `**/docker-compose*.yml` 含 `rabbitmq:` | 中（需排除仅部署描述） |
| rag-pipeline | 依赖 | `langchain` / `llama-index` / `chromadb` / `faiss-cpu` / `pgvector`（requirements.txt / pyproject.toml） | 高 |
| rag-pipeline | 依赖 | `@langchain/core` / `langchainjs` / `llamaindex`（package.json） | 高 |
| rag-pipeline | 代码 | `as_retriever(` / `similarity_search(` / `RetrievalQA` / `VectorStoreIndex` / `VectorStoreRetriever` | 高 |
| rag-pipeline | 代码 | `TextSplitter` / `Embeddings(` / `FAISS` / `Chroma` / `Pinecone` / `Milvus` / `Qdrant` | 中（需与依赖信号组合） |
| rag-pipeline | 配置 | `VECTOR_STORE` / `EMBEDDING_MODEL` / `RAG_` 前缀环境变量 | 中 |
| react-native | 依赖 | package.json dependencies 含 `react-native` | 高（核心包独立可定） |
| react-native | 依赖 | `react-native-webview` / `@react-native-async-storage/async-storage` / `react-native-safe-area-context` | 中（生态组合信号） |
| react-native | 文件 | `metro.config.js` / `react-native.config.js` | 高（RN 专属构建配置） |
| react-native | 文件 | `android/app/build.gradle` + `ios/Podfile` 双端工程并存 | 中（需排除原生工程） |
| react-native | 配置 | `app.json` 含 `"expo"` 或 RN 工程名/入口 | 低（仅作辅助） |
| react | 依赖 | `react` / `react-dom` 包（package.json dependencies）/ `next` / `react-router-dom` / `@reduxjs/toolkit` | 高 |
| react | 文件 | `**/*.jsx` / `**/*.tsx` 含 JSX / `react.config.*` | 中（须组合代码信号） |
| react | 代码 | `import .* from 'react'` / `useState(` / `useEffect(` / `useMemo(` / `useCallback(` / `React.createElement` / `function .*Component` | 高 |
| react | JSX | `<Fragment>` / `<>...</>` / `className=` / `key={` | 中（须组合 import 信号） |
| react | 配置 | `eslint-plugin-react-hooks` / `babel-preset-react` / `vite.config.*` 含 `@vitejs/plugin-react` | 高 |
| redis | 依赖 | `org.springframework.data:spring-data-redis` / `spring-boot-starter-data-redis` / `org.redisson:redisson` / `redis.clients:jedis` / `io.lettuce:lettuce-core` | 高 |
| redis | 注解 | `@Cacheable` / `@CacheEvict` / `@CachePut` / `@Caching`（配合 RedisCacheManager） | 中（须结合 RedisCacheManager 排除 caffeine 等其他 provider） |
| redis | 配置 | `spring.data.redis.*` / `spring.redis.*`（Boot 2.x 旧节点） / `spring.cache.type=redis` | 高 |
| redis | 代码 | `RedisTemplate` / `StringRedisTemplate` / `RedissonClient` / `Jedis` / `@Cacheable` | 高 |
| redis | 文件 | `**/redis.conf` / `**/redis-cluster.yml` | 低（部署侧文件，工程侧仅辅助） |
| rocketmq | 依赖 | `org.apache.rocketmq:rocketmq-spring-boot-starter` / `rocketmq-client` / `rocketmq-client-java` | 高 |
| rocketmq | 注解 | `@RocketMQMessageListener` / `@RocketMQTransactionListener` / `@MessageModel` | 高 |
| rocketmq | 配置 | `rocketmq.name-server` / `rocketmq.producer.*` / `rocketmq.consumer.*` | 高 |
| rocketmq | 代码 | `RocketMQTemplate` / `DefaultMQProducer` / `DefaultMQPushConsumer` / `TransactionListener` / `MessageListenerOrderly` | 高 |
| rocketmq | 文件 | `**/rocketmq*.yml` / `**/rocketmq*.properties` | 中（需排除仅文件名巧合） |
| ruby | 依赖 | Gemfile `gem "rails"` / `gem "sinatra"` / `gem "rspec"` / `gem "puma"` / `gem "rake"` | 高 |
| ruby | 文件 | `Gemfile` / `Gemfile.lock` / `Rakefile` / `*.gemspec` / `**/*.rb` / `**/*.erb` | 高 |
| ruby | 配置 | `.env.example` / `config/*.rb` / `.rspec` / `bin/*` binstubs | 中 |
| ruby | 脚本调用 | `bundle install` / `bundle exec rake` / `bundle exec rspec` / `rackup` / `rails ` | 中 |
| ruby | DSL | `task :` / `desc "`（Rakefile）/ `get "/..." do`（Sinatra）/ `ActiveRecord::` | 中 |
| seata | 依赖 | `io.seata:seata-spring-boot-starter` / `org.apache.seata:seata-spring-boot-starter` / `seata-all` / `seata-saga` | 高 |
| seata | 注解 | `@GlobalTransactional` / `@GlobalLock` / `@TwoPhaseBusinessAction` / `@LocalTCC` | 高 |
| seata | 文件 | `**/undo_log.sql` / `**/seata.conf` / `**/registry.conf` / `**/file.conf` / `**/*statemachine*.json` | 中（需排除他用） |
| seata | 配置 | `seata.tx-service-group` / `seata.service.vgroup-mapping` / `seata.application-id` / `seata.data-source-proxy-mode` / `seata.registry.*` | 高 |
| seata | 代码 | `RootContext.getXID` / `RootContext.bind` / `DataSourceProxy` / `GlobalTransactionScanner` | 高 |
| sentinel | 依赖 | `com.alibaba.cloud:spring-cloud-starter-alibaba-sentinel` / `com.alibaba.csp:sentinel-core` / `sentinel-annotation-aspectj` / `sentinel-datasource-nacos` / `sentinel-spring-cloud-gateway-adapter` / `sentinel-parameter-flow-control` | 高 |
| sentinel | 注解 | `@SentinelResource` | 高 |
| sentinel | 配置 | `spring.cloud.sentinel.*` / `spring.cloud.sentinel.datasource.*` / `spring.cloud.sentinel.transport.dashboard` | 高 |
| sentinel | 代码 | `SphU.entry` / `FlowRule` / `DegradeRule` / `ParamFlowRule` / `SystemRule` / `GatewayFlowRule` / `BlockException` | 高 |
| sentinel | 文件 | `**/sentinel-dashboard*.jar` / `**/sentinel-rules/**` | 中（需排除他用） |
| sharding | 依赖 | `org.apache.shardingsphere:shardingsphere-jdbc` / `shardingsphere-jdbc-core` / `shardingsphere-transaction-xa-core` / `shardingsphere-transaction-base-seata-at` / Proxy 安装包 `apache-shardingsphere-*-shardingsphere-proxy-bin` | 高 |
| sharding | 配置 | `rules:` 下 `- !SHARDING` / `actualDataNodes` / `bindingTables` / `broadcastTables` / `shardingAlgorithms` / `keyGenerators` / `defaultKeyGenerateStrategy` / `- !READWRITE_SPLITTING` | 高 |
| sharding | 配置 | `org.apache.shardingsphere.driver.ShardingSphereDriver` / `jdbc:shardingsphere:` URL / `YamlShardingSphereDataSourceFactory` / `ShardingSphereDataSource` | 高 |
| sharding | 代码 | `HintManager` / `addDatabaseShardingValue` / `addTableShardingValue` / `setDatabaseShardingValue` / `HintShardingAlgorithm` / `StandardShardingAlgorithm` / `ComplexKeysShardingAlgorithm` | 高 |
| sharding | 文件 | `**/sharding*.yaml` / `**/config-sharding*.yaml` / `META-INF` 下含 sharding 规则的 yaml | 中 |
| sharding | DistSQL | `CREATE SHARDING TABLE RULE` / `ALTER SHARDING TABLE RULE` / `CREATE BROADCAST TABLE RULE`（Proxy 侧） | 中 |
| spark | 依赖 | `org.apache.spark:spark-core_2.12` / `spark-sql_2.12` / `spark-streaming_2.12` / `pyspark` / `spark_*` | 高 |
| spark | 代码 | `SparkSession` / `JavaSparkContext` / `SparkContext` / `SparkConf` / `Dataset` / `RDD` | 高 |
| spark | 配置 | `spark.` 前缀配置（`spark.sql.shuffle.partitions` / `spark.executor.memory` / `spark.default.parallelism`） | 高 |
| spark | 文件 | `*.scala` 含 `import org.apache.spark` / `*.py` 含 `from pyspark` / `*.java` 含 `org.apache.spark` | 高 |
| spark | 注解 | `@transient` / `@volatile`（RDD 闭包共享变量标注） | 中 |
| spring-batch | 依赖 | `org.springframework.batch:spring-batch-core` / `org.springframework.batch:spring-batch-infrastructure` / `org.springframework.batch:spring-batch-integration` | 高 |
| spring-batch | 注解 | `@EnableBatchProcessing` / `@StepScope` / `@JobScope` / `@BatchStep` / `@BatchJob` | 高 |
| spring-batch | 类 | `JobBuilder` / `StepBuilder` / `JobBuilderFactory`（5.x 前已废弃）/ `StepBuilderFactory`（5.x 前已废弃）/ `JobRepository` / `JobLauncher` / `JobOperator` / `RunIdIncrementer` | 高 |
| spring-batch | 构建器 DSL | `.chunk(` / `.tasklet(` / `.reader(` / `.writer(` / `.processor(` / `.allowStartIfComplete(` / `.startLimit(` / `.incrementer(` / `.preventRestart()` | 高 |
| spring-batch | SpEL | `@Value("#{jobParameters` / `@Value("#{stepExecutionContext` / `@Value("#{jobExecutionContext` | 高 |
| spring-batch | 配置 | `spring.batch.job.enabled` / `spring.batch.job.name` / `spring.batch.jdbc.initialize-schema` / `spring.batch.jdbc.table-prefix` | 高 |
| spring-batch | 接口实现 | `implements ItemReader<` / `implements ItemWriter<` / `implements ItemProcessor<` / `implements Tasklet` / `implements ItemStream` / `extends AbstractItemStreamItemReader` | 高 |
| spring-boot | 依赖 | `org.springframework.boot:spring-boot-starter` / `spring-boot-starter-web` / `spring-boot-starter-actuator` / `spring-boot-starter-data-jpa` / `spring-boot-starter-test` | 高 |
| spring-boot | 注解 | `@SpringBootApplication` / `@Configuration` / `@ConfigurationProperties` / `@ConditionalOnMissingBean` / `@Profile` / `@SpringBootConfiguration` | 高 |
| spring-boot | 文件 | `**/application.yml` / `**/application.yaml` / `**/application.properties` / `**/application-*.yml` / `banner.txt` / `**/META-INF/spring.factories` / `**/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` | 高 |
| spring-boot | 配置 | `spring.profiles.active` / `management.endpoints.web.exposure.*` / `spring.datasource.*` / `server.port` / `spring.devtools.*` / `spring.main.banner-mode` / `spring.main.allow-circular-references` | 高 |
| spring-boot | 代码 | `SpringApplication.run(` / `@Bean` / `@Transactional` / `extends SpringBootServletInitializer` / `WebSecurityConfigurerAdapter`(废弃) | 高 |
| spring-cloud | 依赖 | `org.springframework.cloud:spring-cloud-starter` / `spring-cloud-starter-openfeign` / `spring-cloud-starter-loadbalancer` / `spring-cloud-starter-gateway` / `spring-cloud-starter-config` / `spring-cloud-starter-netflix-eureka-client` / `spring-cloud-starter-bus` | 高 |
| spring-cloud | 注解 | `@EnableFeignClients` / `@EnableDiscoveryClient` / `@RefreshScope` / `@FeignClient` | 高 |
| spring-cloud | 文件 | `**/bootstrap.yml` / `**/bootstrap.properties` / `**/spring-cloud-bootstrap.yml` | 中（Boot 2.4+ 默认弃用 bootstrap，改 import） |
| spring-cloud | 配置 | `spring.cloud.config.*` / `spring.cloud.gateway.routes.*` / `feign.client.*` / `spring.cloud.loadbalancer.*` / `eureka.client.*` / `spring.cloud.bus.*` | 高 |
| spring-cloud | 代码 | `@FeignClient` / `SpringCloudLoadBalancer` / `RouteLocator` / `@RefreshScope` / `DiscoveryClient` | 高 |
| spring-data-jpa | 依赖 | `org.springframework.boot:spring-boot-starter-data-jpa` / `org.springframework.data:spring-data-jpa` / `org.hibernate.orm:hibernate-core` / `jakarta.persistence:jakarta.persistence-api` | 高 |
| spring-data-jpa | 注解 | `@Entity` / `@Table` / `@Id` / `@OneToMany` / `@ManyToOne` / `@Enumerated` / `@Transactional` / `@EntityGraph` / `@EnableJpaAuditing` / `@EnableJpaRepositories` | 高 |
| spring-data-jpa | 配置 | `spring.jpa.*` / `spring.datasource.*` / `hibernate.*`（`open-in-view` / `ddl-auto` / `show-sql`） | 高 |
| spring-data-jpa | 代码 | `extends JpaRepository<` / `extends CrudRepository<` / `EntityManager` / `@PersistenceContext` / `JpaSpecificationExecutor` | 高 |
| spring-data-jpa | 文件 | `**/entity/**/*.java` / `**/repository/**/*Repository.java` | 中（需组合依赖信号） |
| spring-security | 依赖 | `org.springframework.security:spring-security-core` / `spring-security-web` / `spring-security-config` / `org.springframework.boot:spring-boot-starter-security` / `spring-security-oauth2-client` / `spring-security-oauth2-resource-server` | 高 |
| spring-security | 注解 | `@EnableWebSecurity` / `@EnableMethodSecurity` / `@EnableGlobalMethodSecurity`（遗留） / `@PreAuthorize` / `@PostAuthorize` / `@Secured` / `@RolesAllowed` | 高 |
| spring-security | 配置 | `spring.security.*` / `security.jwt.*` / `jjwt.secret` / `spring.security.oauth2.client.registration.*` | 高 |
| spring-security | 代码 | `SecurityFilterChain` / `WebSecurityConfigurerAdapter` / `PasswordEncoder` / `UserDetailsService` / `OncePerRequestFilter` / `JwtAuthenticationToken` | 高 |
| spring-security | 文件 | `**/SecurityConfig*.java` / `**/*SecurityConfiguration.java` | 中（需组合依赖信号） |
| sqlalchemy | 依赖 | `SQLAlchemy` / `sqlalchemy`（requirements.txt / pyproject.toml） | 高 |
| sqlalchemy | 代码 | `from sqlalchemy import` / `create_engine(` / `sessionmaker(` / `declarative_base` / `DeclarativeBase` | 高 |
| sqlalchemy | 代码 | `select(` + `Mapped[` / `mapped_column(` | 中（2.x 特征，需组合） |
| sqlalchemy | 文件 | `**/alembic.ini` / `**/alembic/env.py` / `**/alembic/versions/` | 高 |
| sqlalchemy | 配置 | `pool_size` / `pool_recycle` / `SQLALCHEMY_DATABASE_URI` | 中 |
| sqlserver | 依赖 | `mssql-jdbc`(com.microsoft.sqlserver) / `Microsoft.Data.SqlClient` / `System.Data.SqlClient` / `mssql`(npm) / `pyodbc` | 高 |
| sqlserver | 文件 | `**/*.sql` 内含 `WITH (NOLOCK)` / `OFFSET ... FETCH` / `[dbo].` / `sp_executesql` | 高 |
| sqlserver | 配置 | `jdbc:sqlserver://` / `Server=.*;Database=` 连接串 / `Initial Catalog` | 高 |
| sqlserver | 代码 | `CREATE PROC` / `IDENTITY(1,1)` / `NVARCHAR` / `@@ROWCOUNT` / `SET NOCOUNT ON` | 高 |
| sqlserver | 服务 | `docker-compose` 含 `image: mcr.microsoft.com/mssql/server` | 中（须排除仅本地开发用途） |
| tailwind | 依赖 | `tailwindcss` 包（package.json devDependencies）/ `@tailwindcss/vite` / `@tailwindcss/postcss` | 高 |
| tailwind | 文件 | `tailwind.config.{js,ts,cjs,mjs}` / `postcss.config.*` 含 `tailwindcss` / `app.css` 含 `@import "tailwindcss"` | 高 |
| tailwind | 代码 | `class="[^"]*\b(flex|grid|p-[0-9]|text-[a-z]+|bg-[a-z]+)` / `@apply` / `@theme` | 高 |
| tailwind | 配置 | `content:` / `theme.extend` / `darkMode:` / `@source` | 高 |
| tdengine | 依赖 | `com.taosdata.jdbc:taos-jdbcdriver` / `taos` / `tdengine` / `taospy` / `TDengine` npm | 高 |
| tdengine | 配置 | `taos.cfg` 含 `firstEp` / `fqdn` / `serverPort=6030` / `keep` / `days` / `rows` | 高 |
| tdengine | 代码 | `TSDB` / `stmt` / `taos` / `WSConnection` / `TDengine` / `createStable` / `create table using` | 高 |
| tdengine | SQL | `CREATE STABLE` / `CREATE TABLE ... USING` / `TAGS` / `KEEP` / `DAYS` / `ROWS` | 高 |
| tdengine | 文件 | `*.sql` 含 `CREATE STABLE` / `taos.cfg` / `*.taos` 脚本 | 中 |
| terraform | 文件 | `**/*.tf` / `**/*.tfvars` | 高（HCL 专属扩展名） |
| terraform | 文件 | `.terraform.lock.hcl` | 高（provider 锁文件，init 产物） |
| terraform | 配置 | `terraform {` 块 / `required_providers` / `backend "` | 高 |
| terraform | 配置 | `resource "aws_|resource "azurerm_|resource "google_` | 中（云 provider 前缀可组合判定） |
| terraform | 目录结构 | `modules/<name>/main.tf` 模块布局 | 低（仅作辅助） |
| typeorm | 依赖 | `package.json` 含 `"typeorm"` / `"@nestjs/typeorm"` / `"typeorm-naming-strategies"` | 高 |
| typeorm | 注解/装饰器 | `@Entity` / `@Column` / `@PrimaryGeneratedColumn` / `@ManyToOne` / `@OneToMany` / `@Index` | 高 |
| typeorm | 文件 | `**/data-source.ts` / `**/ormconfig.json` / `**/migrations/*.ts`（含 `MigrationInterface`） | 中（migrations 目录须组合 MigrationInterface 确认） |
| typeorm | 配置 | `new DataSource({...})` / `createConnection(` / `synchronize:` / `migrationsRun:` | 高 |
| typeorm | 代码 | `getRepository(` / `createQueryBuilder(` / `QueryRunner` / `EntityManager` | 高 |
| validation | 依赖 | `org.hibernate.validator:hibernate-validator` / `org.springframework.boot:spring-boot-starter-validation` / `jakarta.validation:jakarta.validation-api` | 高 |
| validation | 注解 | `@NotNull` / `@NotBlank` / `@NotEmpty` / `@Size` / `@Pattern` / `@Email` / `@Valid` / `@Validated` / `@GroupSequence` / `@DecimalMin` / `@DecimalMax` / `@Future` / `@Past` | 高 |
| validation | 文件 | `**/dto/**/*.java` 中含约束注解 / `**/*Validator.java` 实现 `ConstraintValidator` | 中（需组合注解信号） |
| validation | 配置 | `spring.mvc.problemdetails.enabled` / `validation` 相关 `MessageSource` bean | 低（仅辅助） |
| validation | 代码 | `implements ConstraintValidator<` / `extends AbstractAssert`（误用排除） / `MethodArgumentNotValidException` / `HandlerMethodValidationException` | 高 |
| vite | 依赖 | `vite` 包（package.json devDependencies）/ `@vitejs/plugin-vue` / `@vitejs/plugin-react` | 高 |
| vite | 文件 | `vite.config.ts` / `vite.config.js` / `vite.config.mts` | 高 |
| vite | 配置 | `defineConfig(` / `rollupOptions` / `optimizeDeps` / `server.proxy` | 高 |
| vite | 代码 | `import.meta.env.VITE_` / `import.meta.glob(` / `__VITE_` | 高 |
| vue | 依赖 | `vue` 包（package.json dependencies） / `@vue/runtime-dom` / `@vue/compiler-sfc` / `vue-router` / `pinia` | 高 |
| vue | 文件 | `**/*.vue`（SFC 单文件组件） / `vite.config.ts` 含 `@vitejs/plugin-vue` | 高 |
| vue | 代码 | `<script setup>` / `defineProps(` / `defineEmits(` / `ref(` / `reactive(` / `computed(` / `useRouter()` | 高 |
| vue | 模板 | `v-html` / `v-for` / `v-model` / `<Teleport>` / `<Suspense>` / `<slot>` | 中（须组合 .vue 文件信号） |
| vue | 配置 | `vue.config.js`（Vue CLI） / `vite.config.*` 的 `@vitejs/plugin-vue` | 高 |
| webpack | 依赖 | `webpack` 包（package.json devDependencies）/ `webpack-cli` / `webpack-dev-server` | 高 |
| webpack | 文件 | `webpack.config.ts` / `webpack.config.js` / `webpack.config.prod.*` | 高 |
| webpack | 配置 | `module.exports = { ... }` + `entry`/`output`/`module.rules`/`plugins` | 高 |
| webpack | 代码 | `require.context(` / `import(/* webpackChunkName */)` / `module.hot` | 高 |
| xxl-job | 依赖 | `com.xuxueli:xxl-job-core` | 高 |
| xxl-job | 注解 | `@XxlJob` | 高 |
| xxl-job | 配置 | `xxl.job.admin.addresses` / `xxl.job.executor.*` / `xxl.job.accessToken` | 高 |
| xxl-job | 代码 | `XxlJobHelper` / `XxlJobExecutor` / `IJobHandler` | 高 |
| xxl-job | 文件 | `**/xxl-job-executor*.yml` / `**/application*.properties` 中含 `xxl.job.` 节点 | 中（需排除仅样例文档） |
