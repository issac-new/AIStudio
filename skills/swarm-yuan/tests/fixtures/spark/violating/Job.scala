// spark fixture violating: .collect() 全量拉 driver + groupByKey 无 salting + join 无 broadcast + 多 action 无 persist + 迭代无 checkpoint + window 无 watermark
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions._

object BadJob {
  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder().appName("bad").getOrCreate()
    import spark.implicits._
    // 故意 .collect() 全量拉 driver → fw_spark_collect fail
    val df = spark.read.parquet("s3://bucket/events")
    val rows = df.collect()
    // 故意 groupByKey 无 repartition/salting → fw_spark_data_skew warn
    val rdd = df.rdd.map(r => (r.getInt(0), r))
    val grouped = rdd.groupByKey()
    // 故意 join 无 broadcast → fw_spark_broadcast warn
    val big = spark.read.parquet("s3://bucket/big")
    val small = spark.read.parquet("s3://bucket/small")
    val joined = big.join(small, "id")
    // 故意多 action 无 persist → fw_spark_persist warn
    val agg = df.groupBy("uid").count()
    val c1 = agg.count()
    val c2 = agg.count()
    // 故意迭代循环无 checkpoint → fw_spark_checkpoint warn
    var r = df.rdd
    for (i <- 1 to 10) { r = r.map(x => x) }
    // 故意 window 聚合无 watermark → fw_spark_streaming_watermark warn
    val stream = spark.readStream.format("kafka").load()
    val win = stream.groupBy(window($"ts", "5 minutes")).count()
    spark.stop()
  }
}
