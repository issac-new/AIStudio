import java.time.Duration;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.restartstrategy.RestartStrategies;
import org.apache.flink.api.common.state.StateTtlConfig;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.util.OutputTag;

// 正例：checkpoint + watermark + restart strategy + uid + 状态 TTL + 迟到数据侧输出
public class OrderAggJob {

    private ValueState<Long> lastCount;

    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(60000);
        env.setRestartStrategy(RestartStrategies.failureRateRestart(3,
            org.apache.flink.api.common.time.Time.minutes(5),
            org.apache.flink.api.common.time.Time.seconds(10)));

        StateTtlConfig ttl = StateTtlConfig.newBuilder(
                org.apache.flink.api.common.time.Time.hours(24))
            .cleanupFullSnapshot()
            .build();
        ValueStateDescriptor<Long> desc = new ValueStateDescriptor<>("last-count", Long.class);
        desc.enableTimeToLive(ttl);

        OutputTag<String> lateTag = new OutputTag<String>("late"){};

        DataStream<String> stream = env.socketTextStream("localhost", 9999)
            .assignTimestampsAndWatermarks(
                WatermarkStrategy.<String>forBoundedOutOfOrderness(Duration.ofSeconds(30))
                    .withTimestampAssigner((e, ts) -> System.currentTimeMillis()))
            .uid("source-watermark");

        stream.map(s -> s).uid("identity-map")
              .keyBy(s -> s)
              .window(TumblingEventTimeWindows.of(Time.minutes(5)))
              .allowedLateness(Time.minutes(1))
              .sideOutputLateData(lateTag)
              .sum(0).uid("window-sum");

        env.execute("order-agg-job");
    }
}
