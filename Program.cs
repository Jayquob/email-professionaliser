using Microsoft.AspNetCore.Mvc;
using OpenAI.Chat;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// 1. Allow the frontend UI to talk to this API later
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();
app.UseCors();

// 2. Set up the OpenAI Client
string apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? throw new Exception("Missing OPENAI_API_KEY environment variable");
ChatClient aiClient = new("gpt-4o-mini", apiKey);

// 3. Create the endpoint that receives the email
app.MapPost("/api/analyze", async ([FromBody] EmailRequest request) =>
{
    var systemPrompt = @"You are a professional communication editor. 
Analyze the user's email. Identify informal, aggressive, or passive-aggressive phrases.
Return ONLY a JSON array of objects with 'originalPhrase', 'suggestedPhrase', and 'reason'. 
Do not include markdown blocks like ```json.";

    var messages = new List<ChatMessage>
    {
        new SystemChatMessage(systemPrompt),
        new UserChatMessage(request.EmailText)
    };

    var response = await aiClient.CompleteChatAsync(messages);
    var rawJson = response.Value.Content[0].Text;

    try
    {
        // Parse the JSON string so our API returns a clean JSON array
        var structuredResponse = JsonSerializer.Deserialize<object>(rawJson);
        return Results.Ok(structuredResponse);
    }
    catch
    {
        return Results.Problem("AI did not return valid JSON.", statusCode: 500);
    }
});

app.Run();

// Data model for the incoming request
public class EmailRequest
{
    public string EmailText { get; set; } = string.Empty;
}