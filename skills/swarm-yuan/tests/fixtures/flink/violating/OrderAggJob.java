import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.streaming.api.datastream.DataStream;

// 反例：无 checkpoint / 无 watermark / 无 restart strategy / 无 uid / 状态无 TTL
public class OrderAggJob {

    private ValueState<Long> lastCount;

    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        DataStream<String> stream = env.socketTextStream("localhost", 9999);

        stream.map(s -> s)
              .keyBy(s -> s)
              .window(TumblingEventTimeWindows.of(Time.minutes(5)))
              .sum(0);

        env.execute("order-agg-job");
    }
}
