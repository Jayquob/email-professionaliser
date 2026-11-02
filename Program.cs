using Microsoft.AspNetCore.Mvc;
using OpenAI;
using OpenAI.Chat;
using System.ClientModel;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();
app.UseCors();

string apiKey = Environment.GetEnvironmentVariable("GROQ_API_KEY") ?? throw new Exception("Missing GROQ_API_KEY environment variable");
OpenAIClientOptions options = new OpenAIClientOptions { Endpoint = new Uri("https://api.groq.com/openai/v1/") };
ChatClient aiClient = new("openai/gpt-oss-20b", new ApiKeyCredential(apiKey), options);
app.MapPost("/api/analyze", async ([FromBody] EmailRequest request) =>
{
    try
    {
        var systemPrompt = @"You are a professional communication editor. 
Analyze the user's email. Identify informal, aggressive, or passive-aggressive phrases.
Return ONLY a JSON array of objects with 'originalPhrase', 'suggestedPhrase', and 'reason'.";

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(systemPrompt),
            new UserChatMessage(request.EmailText)
        };

        // 1. Send to Groq
        var response = await aiClient.CompleteChatAsync(messages);
        var rawJson = response.Value.Content[0].Text.Trim();

        Console.WriteLine("\n--- RAW AI RESPONSE ---");
        Console.WriteLine(rawJson);
        Console.WriteLine("-----------------------\n");

        // 2. Clean up markdown
        if (rawJson.StartsWith("```json")) rawJson = rawJson.Substring(7);
        else if (rawJson.StartsWith("```")) rawJson = rawJson.Substring(3);
        if (rawJson.EndsWith("```")) rawJson = rawJson.Substring(0, rawJson.Length - 3);
        rawJson = rawJson.Trim();

        // 3. Parse JSON
        var structuredResponse = JsonSerializer.Deserialize<object>(rawJson);
        return Results.Ok(structuredResponse);
    }
    catch (Exception ex)
    {
        // THIS IS THE LIFESAVER: It will print the exact crash reason to Terminal 1
        Console.WriteLine("\n!!! SERVER CRASHED !!!");
        Console.WriteLine("Reason: " + ex.Message);
        return Results.Problem("Server crashed: " + ex.Message, statusCode: 500);
    }
});

app.Run();

public class EmailRequest
{
    public string EmailText { get; set; } = string.Empty;
}