// spark fixture compliant: 全部反模式均已规避
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions._
import org.apache.spark.sql.functions.broadcast

object GoodJob {
  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder().appName("good").getOrCreate()
    spark.conf.set("spark.sql.shuffle.partitions", "400")
    import spark.implicits._
    // 单 action 取样本，非全量
    val df = spark.read.parquet("s3://bucket/events")
    val sample = df.limit(100).collect()
    // 热点 key 打散
    val rdd = df.rdd.map(r => (r.getInt(0), r))
    val grouped = rdd.repartition(400).groupByKey()
    // 小表广播
    val big = spark.read.parquet("s3://bucket/big")
    val small = spark.read.parquet("s3://bucket/small")
    val joined = big.join(broadcast(small), "id")
    // 多 action 物化
    val agg = df.groupBy("uid").count().persist()
    val c1 = agg.count()
    val c2 = agg.count()
    spark.stop()
  }
}
