package com.example.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

// 合规：无实例状态，线程安全（ValidatorFactory 单例复用前提）
public class UpperCaseValidator implements ConstraintValidator<UpperCase, String> {

    private static final int MAX_LENGTH = 255;

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value == null || (value.length() <= MAX_LENGTH && value.equals(value.toUpperCase()));
    }
}
