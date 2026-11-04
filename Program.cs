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
        // Switch the prompt based on the mode requested by the frontend
        var systemPrompt = request.Mode == "surface" 
            ? @"You are an editing API. Analyze the email for obvious typos and blatant unprofessionalism (swear words, slang). 
            You MUST NOT censor profanity—output the exact uncensored swear word in 'originalPhrase'. Do not include trailing punctuation. 
            Return ONLY a JSON array of objects with keys: 'originalPhrase', 'suggestedPhrase', 'reason', and 'type'. 
            STRICT RULES FOR 'type':
            - For spelling/grammar mistakes, set 'type' strictly to 'typo'.
            - For swear words, insults, or slang, set 'type' strictly to 'unprofessional'.
            - For key smashing, remove and don't replace with text"
            : @"You are a communication expert. Analyze for subtle tone issues, passive-aggressiveness, and polish. Return ONLY a JSON array of objects with 'originalPhrase', 'suggestedPhrase', 'reason', and 'type' (set type to 'tone').";

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(systemPrompt)
        };

        // Replay the memory before processing the new text
        if (request.History != null)
        {
            foreach (var pastMessage in request.History)
            {
                if (pastMessage.Role == "user")
                    messages.Add(new UserChatMessage(pastMessage.Content));
                else if (pastMessage.Role == "assistant")
                    messages.Add(new AssistantChatMessage(pastMessage.Content));
            }
        }

        // Add the current draft
        messages.Add(new UserChatMessage(request.EmailText));

        var response = await aiClient.CompleteChatAsync(messages);
        var rawJson = response.Value.Content[0].Text.Trim();

        if (rawJson.StartsWith("```json")) rawJson = rawJson.Substring(7);
        else if (rawJson.StartsWith("```")) rawJson = rawJson.Substring(3);
        if (rawJson.EndsWith("```")) rawJson = rawJson.Substring(0, rawJson.Length - 3);
        rawJson = rawJson.Trim();

        var structuredResponse = JsonSerializer.Deserialize<object>(rawJson);
        return Results.Ok(structuredResponse);
    }
    catch (Exception ex)
    {
        Console.WriteLine("\n!!! SERVER CRASHED !!!\nReason: " + ex.Message);
        return Results.Problem("Server crashed: " + ex.Message, statusCode: 500);
    }
});

app.Run();

public class EmailRequest
{
    public string EmailText { get; set; } = string.Empty;
    public string Mode { get; set; } = "deep"; 
    public List<MessageLog> History { get; set; } = new();
}

public class MessageLog
{
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}