package com.example.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class UserDTO {
    @NotBlank
    @Size(max = 64)
    private String name;

    @Valid
    private AddressDTO address;

    public String getName() { return name; }
    public AddressDTO getAddress() { return address; }
}
