
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight, Check, Copy, Download, FileText,
  LogOut, ShieldCheck, Sparkles, Video, WandSparkles
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Content = {
  video_scripts: {
    title: string;
    hook: string;
    script: string;
    cta: string;
  }[];
  x_posts: string[];
  linkedin_posts: string[];
  quote_cards: { quote: string; design: string }[];
  posting_plan: { day: string; content: string; reason: string }[];
};

function flattenContent(data: Content): string {
  return [
    "FRAMECRUMB — GENERATED CONTENT",
    "",
    "SHORT-VIDEO SCRIPTS",
    ...data.video_scripts.flatMap((item, i) => [
      `${i + 1}. ${item.title}`,
      `Hook: ${item.hook}`,
      item.script,
      `Call to action: ${item.cta}`,
      ""
    ]),
    "X POSTS",
    ...data.x_posts.map((item, i) => `${i + 1}. ${item}`),
    "",
    "LINKEDIN POSTS",
    ...data.linkedin_posts.map((item, i) => `${i + 1}. ${item}`),
    "",
    "QUOTE CARDS",
    ...data.quote_cards.map(
      (item, i) => `${i + 1}. ${item.quote}\nDesign: ${item.design}`
    ),
    "",
    "POSTING PLAN",
    ...data.posting_plan.map(
      item => `${item.day}: ${item.content}\n${item.reason}`
    )
  ].join("\n");
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [transcript, setTranscript] = useState("");
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [admin, setAdmin] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setContent(null);
      setMessage("");
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function authenticate(event: FormEvent) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase isn't configured yet.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        if (password.length < 8) {
          throw new Error("Use a password with at least 8 characters.");
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });

        if (error) throw error;

        setMessage(
          data.session
            ? "Account created. Check your email for verification."
            : "Account created. Check your email to verify your address, then sign in."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Authentication failed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!supabase || !email) {
      setMessage("Enter your email address first.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });

    setMessage(
      error
        ? error.message
        : "If the account exists, a password reset email will be sent."
    );
  }

  async function generate() {
    if (!supabase || !session) return;

    if (transcript.trim().length < 20) {
      setMessage("Paste a transcript of at least 20 characters.");
      return;
    }

    setLoading(true);
    setMessage("");
    setContent(null);

    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error || !data.session) {
        throw new Error("Your session expired. Please sign in again.");
      }

      const response = await fetch("/.netlify/functions/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`
        },
        body: JSON.stringify({ transcript })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Generation failed.");
      }

      setContent(result.content);
      setAdmin(Boolean(result.admin));
      setMessage("Your content is ready.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Generation failed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyAll() {
    if (!content) return;

    try {
      await navigator.clipboard.writeText(flattenContent(content));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Copy was blocked by your browser. Try downloading the text.");
    }
  }

  function downloadAll() {
    if (!content) return;

    const blob = new Blob([flattenContent(content)], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "framecrumb-content.txt";
    link.click();

    URL.revokeObjectURL(url);
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setContent(null);
    setTranscript("");
    setAdmin(false);
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <a className="brand" href="#">
            <span className="brand-mark"><Sparkles size={19} /></span>
            framecrumb
          </a>

          <div className="eyebrow">CONTENT, MULTIPLIED</div>
          <h1>One source.<br /><span>Ten pieces of content.</span></h1>
          <p className="muted">
            Turn a transcript into ready-to-edit social content in minutes.
          </p>

          <form onSubmit={authenticate} className="auth-form">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />

            <button className="primary full" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>

          <div className="auth-links">
            <button className="text-button" onClick={resetPassword}>
              Forgot password?
            </button>
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
            >
              {mode === "login" ? "Create an account" : "Back to sign in"}
            </button>
          </div>

          {message && <p className="notice" role="status">{message}</p>}

          <div className="security-note">
            <ShieldCheck size={17} />
            Your account is protected by Supabase authentication.
          </div>
        </section>

        <aside className="auth-art">
          <div className="art-orb orb-one" />
          <div className="art-orb orb-two" />
          <div className="art-card">
            <div className="art-card-top">
              <span className="status-dot" /> YOUR CONTENT WORKSPACE
            </div>
            <div className="art-title">Create once.<br />Show up everywhere.</div>
            {[
              ["01", "Short-video scripts", "3 variations"],
              ["02", "X posts", "2 ready to edit"],
              ["03", "LinkedIn posts", "2 professional drafts"],
              ["04", "Quote cards + plan", "3 more assets"]
            ].map(item => (
              <div className="art-row" key={item[0]}>
                <span className="art-number">{item[0]}</span>
                <span className="art-label">
                  <strong>{item[1]}</strong>
                  <small>{item[2]}</small>
                </span>
                <Check size={17} className="art-check" />
              </div>
            ))}
          </div>
          <p className="art-caption">Less rewriting. More creating.</p>
        </aside>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-mark"><Sparkles size={19} /></span>
          framecrumb
        </a>

        <div className="side-label">WORKSPACE</div>
        <div className="side-link active">
          <WandSparkles size={17} /> Content studio
        </div>
        <div className="side-link">
          <FileText size={17} /> Your content
        </div>
        <div className="side-link">
          <Video size={17} /> Video tools
          <span className="soon">Later</span>
        </div>

        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-icon"><ShieldCheck size={17} /></div>
            <strong>{admin ? "Admin access" : "Free plan"}</strong>
            <p>{admin ? "Unlimited app generations" : "One successful generation per UTC day"}</p>
          </div>
          <button className="side-link logout" onClick={logout}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="eyebrow">YOUR WORKSPACE</div>
            <h2>Content studio</h2>
          </div>
          <div className="profile-chip">
            <span className="profile-avatar">{session.user.email?.[0]?.toUpperCase() || "U"}</span>
            <span>{session.user.email}</span>
          </div>
        </header>

        <section className="welcome">
          <div className="welcome-copy">
            <span className="pill"><Sparkles size={14} /> AI CONTENT WORKFLOW</span>
            <h1>Make one idea<br />go <span>ten times further.</span></h1>
            <p>Start with a transcript. Get a set of content drafts you can refine and publish.</p>
          </div>
          <div className="welcome-graphic"><WandSparkles size={64} /></div>
        </section>

        <section className="workspace-grid">
          <div className="panel input-panel">
            <div className="panel-heading">
              <div className="step-number">01</div>
              <div>
                <h3>Add your transcript</h3>
                <p>Paste text from a video or podcast.</p>
              </div>
            </div>

            <label htmlFor="transcript">SOURCE TRANSCRIPT</label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={e => setTranscript(e.target.value.slice(0, 30000))}
              placeholder="Paste your transcript here…&#10;&#10;Tip: Include the main idea, examples, and key takeaways for stronger results."
              rows={12}
            />
            <div className="input-footer">
              <span>{transcript.length.toLocaleString()} / 30,000 characters</span>
              <span>Minimum 20</span>
            </div>

            <button
              className="primary full generate-button"
              onClick={generate}
              disabled={loading || transcript.trim().length < 20}
            >
              {loading ? "Generating…" : "Generate my content"}
              <ArrowRight size={17} />
            </button>
            <p className="small-note">
              <ShieldCheck size={14} /> Your text is sent securely to the configured AI service.
            </p>
          </div>

          <div className="panel outputs-panel">
            <div className="panel-heading">
              <div className="step-number">02</div>
              <div>
                <h3>Your content</h3>
                <p>Ten pieces, one source.</p>
              </div>
            </div>

            {!content && (
              <div className="empty-state">
                <div className="empty-icon"><WandSparkles size={27} /></div>
                <h3>Your next idea starts here</h3>
                <p>Generate content to see your scripts, posts, quote cards and posting plan.</p>
                <div className="output-preview">
                  {["3 short-video scripts", "2 X posts", "2 LinkedIn posts", "2 quote-card ideas", "1 posting plan"].map(label => (
                    <div key={label}><Check size={15} /> {label}</div>
                  ))}
                </div>
              </div>
            )}

            {content && (
              <>
                <div className="result-actions">
                  <button className="secondary" onClick={copyAll}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? "Copied" : "Copy all"}
                  </button>
                  <button className="secondary" onClick={downloadAll}>
                    <Download size={15} /> Download text
                  </button>
                </div>

                <div className="results-list">
                  <ResultGroup title="Short-video scripts" items={content.video_scripts.map(x => `${x.title}\nHook: ${x.hook}\n${x.script}\nCTA: ${x.cta}`)} />
                  <ResultGroup title="X posts" items={content.x_posts} />
                  <ResultGroup title="LinkedIn posts" items={content.linkedin_posts} />
                  <ResultGroup title="Quote-card ideas" items={content.quote_cards.map(x => `${x.quote}\nDesign: ${x.design}`)} />
                  <ResultGroup title="Posting plan" items={content.posting_plan.map(x => `${x.day}: ${x.content}\n${x.reason}`)} />
                </div>
              </>
            )}
          </div>
        </section>

        {message && (
          <div className="notice app-notice" role="status">{message}</div>
        )}

        <footer className="footer">
          <span>FRAMECRUMB</span>
          <span>One source. More ways to connect.</span>
        </footer>
      </main>
    </div>
  );
}

function ResultGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="result-group">
      <h4>{title} <span>{items.length}</span></h4>
      {items.map((item, index) => (
        <article className="result-item" key={`${title}-${index}`}>
          <div className="result-index">{String(index + 1).padStart(2, "0")}</div>
          <p>{item}</p>
        </article>
      ))}
    </section>
  );
}
