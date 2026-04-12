interface NarrativeRequest {
  studentName: string;
  lessonFocus: string;
  tags: string[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildFallbackNarrative(payload: NarrativeRequest) {
  const focus = payload.lessonFocus || "today's lesson";
  const highlight = payload.tags.length > 0 ? payload.tags.slice(0, 3).join(", ") : "steady effort";
  return `${payload.studentName} participated actively during ${focus} and showed ${highlight}. We practiced the target skills with guided support and saw progress in class. Next lesson will reinforce this with short review and confidence-building exercises.`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await request.json()) as NarrativeRequest;
    const apiKey = Deno.env.get("LLM_API_KEY");
    const model = Deno.env.get("LLM_MODEL") ?? "gpt-4o-mini";

    if (!apiKey) {
      return new Response(JSON.stringify({ draft: buildFallbackNarrative(payload), source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You write exactly three concise sentences for a parent update. Keep tone constructive and avoid medical or diagnostic language.",
          },
          {
            role: "user",
            content: `Student: ${payload.studentName}\nFocus: ${payload.lessonFocus}\nTags: ${payload.tags.join(", ")}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ draft: buildFallbackNarrative(payload), source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const data = await response.json();
    const draft = data.choices?.[0]?.message?.content ?? buildFallbackNarrative(payload);
    return new Response(JSON.stringify({ draft, source: "llm" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Unable to generate narrative." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
