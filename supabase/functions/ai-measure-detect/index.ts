import "https://deno.land/std@0.168.0/dotenv/load.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { image, step, prompt } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Gemini vision model to analyze the body in the image
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an AI body measurement assistant for a tailoring platform. Analyze the image of a person and estimate their body measurements based on visual proportions and standard anthropometric ratios.

Return a JSON array of measurements. Each measurement should have:
- "label": The measurement name (e.g., "Chest", "Waist", "Hips", "Shoulder Width", "Sleeve Length", "Inseam", "Neck", "Back Length")
- "value": The estimated measurement as a number (in inches)
- "unit": "in"
- "confidence": A confidence score between 0.0 and 1.0

Step ${step + 1} instructions: ${prompt}

Based on the pose in this step, provide the most relevant measurements you can estimate. Be conservative with confidence scores.

IMPORTANT: Return ONLY the JSON array, no other text. Example:
[{"label":"Chest","value":40,"unit":"in","confidence":0.75},{"label":"Waist","value":34,"unit":"in","confidence":0.7}]`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: image }
              },
              {
                type: "text",
                text: `Analyze this image for body measurements. Current step: ${prompt}`
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", errText);
      return new Response(
        JSON.stringify({ error: `AI analysis failed [${aiResponse.status}]` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";

    // Parse the JSON from AI response
    let measurements = [];
    try {
      // Extract JSON array from response (handle markdown code blocks)
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        measurements = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("Failed to parse AI measurements:", parseErr, content);
      measurements = [];
    }

    return new Response(
      JSON.stringify({ measurements, step }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-measure-detect error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
