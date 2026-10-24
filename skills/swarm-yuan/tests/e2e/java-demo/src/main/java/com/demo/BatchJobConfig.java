package com.demo;
import org.springframework.batch.item.ItemReader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
/**
 * spring-batch 违例：@Value jobParameters late binding 无 @StepScope
 */
@Configuration
public class BatchJobConfig {
    @Bean
    public ItemReader<String> reader(@Value("#{jobParameters['input.file.name']}") String fileName) {
        return null;
    }
}
