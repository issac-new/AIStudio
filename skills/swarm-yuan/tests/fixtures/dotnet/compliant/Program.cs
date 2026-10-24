using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;

var builder = WebApplication.CreateBuilder();
builder.Services.AddHttpClient();
var app = builder.Build();
app.UseHttpsRedirection();

app.MapGet("/users", [Authorize] (string name) => {
    var users = db.Users.Where(u => u.Name == name).ToList();
    return Results.Ok(users);
});

app.MapPost("/register", [Authorize] (string password) => {
    var hash = BCrypt.Net.BCrypt.HashPassword(password);
    var user = new User { PasswordHash = hash };
    db.Save(user);
    return Results.Ok();
});

app.Run();
