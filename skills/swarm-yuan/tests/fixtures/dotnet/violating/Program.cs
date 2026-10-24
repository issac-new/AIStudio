using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

var builder = WebApplication.CreateBuilder();
var app = builder.Build();

app.MapGet("/users", (string name) => {
    var cmd = $"SELECT * FROM Users WHERE Name = '{name}'";
    db.ExecuteSqlRaw(cmd);
    return Results.Ok();
});

app.MapPost("/register", (string password) => {
    var user = new User { Password = password };
    db.Save(user);
    return Results.Ok();
});

var client = new HttpClient();
Console.WriteLine("Server started");
app.Run();
