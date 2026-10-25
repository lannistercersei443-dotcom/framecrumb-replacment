
import { createClient } from "@supabase/supabase-js";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

function reply(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Method not allowed." });
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY,
    ADMIN_EMAIL,
    OPENAI_TEXT_MODEL
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ||
      !OPENAI_API_KEY || !ADMIN_EMAIL) {
    return reply(500, { error: "Server configuration is incomplete." });
  }

  const authorization = event.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) return reply(401, { error: "Please sign in." });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } =
    await db.auth.getUser(token);

  const user = authData?.user;

  if (authError || !user) {
    return reply(401, { error: "Your session is invalid." });
  }

  if (!user.email_confirmed_at) {
    return reply(403, { error: "Verify your email before generating content." });
  }

  let input;

  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Invalid request body." });
  }

  const transcript =
    typeof input.transcript === "string" ? input.transcript.trim() : "";

  if (transcript.length < 20 || transcript.length > 30000) {
    return reply(400, {
      error: "Enter a transcript between 20 and 30,000 characters."
    });
  }

  const isAdmin =
    user.email.toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();

  const day = new Date().toISOString().slice(0, 10);
  let reserved = false;

  try {
    if (!isAdmin) {
      const { data, error } = await db.rpc("reserve_daily_generation", {
        p_user_id: user.id,
        p_day: day
      });

      if (error) throw error;

      if (!data) {
        return reply(429, {
          error: "You've used today's generation. Please try again tomorrow."
        });
      }

      reserved = true;
    }

    const aiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_TEXT_MODEL || "gpt-4.1-mini",
          instructions:
            "You are Framecrumb, a professional social media strategist. " +
            "Return a valid JSON object only. Create exactly 3 short-video scripts, " +
            "2 X posts, 2 LinkedIn posts, 2 quote-card ideas and 1 posting-plan item. " +
            "Stay faithful to the source. Never invent factual claims. " +
            "Use this schema: " +
            '{"video_scripts":[{"title":"...","hook":"...","script":"...","cta":"..."}],' +
            '"x_posts":["...","..."],"linkedin_posts":["...","..."],' +
            '"quote_cards":[{"quote":"...","design":"..."},{"quote":"...","design":"..."}],' +
            '"posting_plan":[{"day":"...","content":"...","reason":"..."}]}',
          input: `Create the content from this transcript:\n\n${transcript}`,
          max_output_tokens: 5000
        })
      }
    );

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      throw new Error("AI provider request failed.");
    }

    const outputText = (aiData.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");

    let content;

    try {
      content = JSON.parse(outputText);
    } catch {
      throw new Error("The AI returned invalid JSON.");
    }

    const valid =
      Array.isArray(content.video_scripts) &&
      content.video_scripts.length === 3 &&
      Array.isArray(content.x_posts) &&
      content.x_posts.length === 2 &&
      Array.isArray(content.linkedin_posts) &&
      content.linkedin_posts.length === 2 &&
      Array.isArray(content.quote_cards) &&
      content.quote_cards.length === 2 &&
      Array.isArray(content.posting_plan) &&
      content.posting_plan.length === 1;

    if (!valid) throw new Error("The AI result was incomplete.");

    if (reserved) {
      const { data: completed, error } = await db.rpc(
        "complete_daily_generation",
        { p_user_id: user.id, p_day: day }
      );

      if (error || !completed) {
        throw new Error("Could not confirm the daily allowance.");
      }

      reserved = false;
    }

    return reply(200, {
      content,
      admin: isAdmin,
      remaining: isAdmin ? null : 0
    });
  } catch (error) {
    if (reserved) {
      const { error: releaseError } = await db.rpc(
        "release_daily_generation",
        { p_user_id: user.id, p_day: day }
      );

      if (releaseError) {
        console.error("Could not release pending reservation.");
      }
    }

    console.error("Generation failed:", error.message);

    return reply(502, {
      error: "Generation failed. Please try again."
    });
  }
}
