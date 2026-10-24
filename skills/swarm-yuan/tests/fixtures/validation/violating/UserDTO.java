package com.example.dto;

import jakarta.validation.constraints.NotNull;

public class UserDTO {
    @NotNull
    private String name;

    private AddressDTO address;

    public String getName() { return name; }
    public AddressDTO getAddress() { return address; }
}
