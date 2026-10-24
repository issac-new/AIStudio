package com.example.batch;

import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.batch.item.ItemReader;
import org.springframework.batch.item.file.FlatFileItemReader;
import org.springframework.batch.item.file.builder.FlatFileItemReaderBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * compliant fixture:
 *  - @Value("#{jobParameters['input.file.name']}") 的 reader Bean 有 @StepScope → late binding 正常，不触发 fw_batch_step_scope
 *  - late binding 须在 Step 启动后才求值，缺 @StepScope 才会在容器启动期注入 null / SpEL 求值失败；有则正常
 *  - Step / Job Bean 无 late binding，不应加 @StepScope（官方建议 Step bean 不 step-scope）
 *
 * 期望：bash run-framework-fixture.sh spring-batch → compliant 退出码 = 0（PASS）
 */
@Configuration
public class BatchJobConfig {

    @StepScope
    @Bean
    public FlatFileItemReader<String> itemReader(
            @Value("#{jobParameters['input.file.name']}") String fileName) {
        return new FlatFileItemReaderBuilder<String>()
                .name("itemReader")
                .resource(new FileSystemResource(fileName))
                .build();
    }

    @Bean
    public Step step1(JobRepository jobRepository,
                      PlatformTransactionManager transactionManager,
                      FlatFileItemReader<String> reader) {
        return new StepBuilder("step1", jobRepository)
                .<String, String>chunk(10).transactionManager(transactionManager)
                .reader(reader)
                .writer(items -> { })
                .build();
    }

    @Bean
    public Job job1(JobRepository jobRepository, Step step1) {
        return new org.springframework.batch.core.job.builder.JobBuilder("job1", jobRepository)
                .start(step1)
                .build();
    }
}
