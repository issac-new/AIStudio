package com.example.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

// 违规：可变实例字段——ValidatorFactory 单例复用，并发校验状态串扰
public class UpperCaseValidator implements ConstraintValidator<UpperCase, String> {

    private int callCount = 0;

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        callCount++;
        if (callCount > 1000) {
            return false;
        }
        return value == null || value.equals(value.toUpperCase());
    }
}
