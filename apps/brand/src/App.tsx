import { useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "cn";

const sections = [
  ["principles", "Principles"],
  ["color", "Color"],
  ["meaning", "What color means"],
  ["spotlights", "Spotlight cards"],
  ["type", "Typography"],
  ["typing", "Typing states"],
  ["components", "Components"],
  ["shape", "Shape and layout"],
  ["motion", "Motion"],
  ["voice", "Voice and copy"],
  ["rules", "Do and don't"],
] as const;

export function App() {
  return (
    <div className="mx-auto grid max-w-[1320px] gap-12 px-6 py-12 md:px-10 lg:grid-cols-[200px_1fr] lg:gap-16">
      <nav className="lg:sticky lg:top-12 lg:self-start" aria-label="Sections">
        <p className="font-display text-xl font-medium tracking-[-0.04em]">Vibecodemaxxing</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Brand guidelines</p>
        <ol className="mt-6 hidden gap-1 lg:grid">
          {sections.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="block rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-card hover:text-foreground"
              >
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <main className="flex min-w-0 flex-col gap-24">
        <Hero />
        <Principles />
        <Colors />
        <Meaning />
        <Spotlights />
        <Typography />
        <TypingStates />
        <Components />
        <Shape />
        <Motion />
        <Voice />
        <Rules />
        <footer className="border-t pt-8 pb-4 text-[13px] text-muted-foreground">
          Tokens live in <Code>apps/web/src/app/globals.css</Code>. This page imports that file and the real
          components in <Code>apps/web/src/components/ui</Code>, so what you see here is what ships.
        </footer>
      </main>
    </div>
  );
}

function Hero() {
  return (
    <header className="spotlight relative flex flex-col gap-6 overflow-hidden rounded-[30px] p-8 text-white md:p-12">
      <Badge className="h-7 bg-black/30 px-3 text-[13px] text-white">Maximum vibes. Questionable code.</Badge>
      <h1 className="font-display text-[clamp(3rem,7vw,5.3rem)] leading-[0.95] font-medium tracking-[-0.05em]">
        One look for
        <br />
        the whole team.
      </h1>
      <p className="max-w-xl text-lg leading-[1.3] text-white/90">
        Vibecodemaxxing is a dark, poster-loud game UI. It borrows Framer&rsquo;s black canvas and white pills, then
        gives each moment of the game its own gradient. Use this page to check a color, a type size, or a curve
        before you build something new.
      </p>
    </header>
  );
}

function Principles() {
  const items = [
    ["Dark only", "The canvas is #090909 on every screen. There is no light mode."],
    ["Lift, don't tint", "Show hierarchy by stepping up a surface: canvas, then card, then muted. Don't fade white text."],
    ["One primary action", "The white pill is the only primary button. Everything else is a charcoal pill or a link."],
    ["Every color has a job", "Violet means typing. Blue means the agent and the shower. Don't swap them for decoration."],
    ["Gradients are cards", "Spotlight gradients fill a single card for a single moment. Never a whole section."],
    ["Motion answers the player", "Animate feedback: points, streaks, mistakes, rank. Don't animate for decoration."],
  ];
  return (
    <Section id="principles" title="Principles" lead="Six rules. If a design breaks one of them, it's probably off-brand.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([title, body], index) => (
          <Card key={title} className="rounded-[20px]">
            <CardHeader>
              <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
              <CardTitle className="font-display text-[22px] font-medium tracking-[-0.03em]">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-[15px] leading-[1.4] text-muted-foreground">{body}</CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

interface Swatch {
  name: string;
  hex: string;
  token: string;
  use: string;
  unused?: boolean;
}

const surfaces: Swatch[] = [
  { name: "Canvas", hex: "#090909", token: "bg-background", use: "The page. Every screen sits on it." },
  { name: "Surface 1", hex: "#141414", token: "bg-card", use: "Cards, inputs, secondary pills." },
  { name: "Surface 2", hex: "#1c1c1c", token: "bg-muted", use: "Hover states, popovers, empty progress." },
  { name: "Hairline", hex: "#262626", token: "border-border", use: "Borders, dividers, card rings." },
];

const inks: Swatch[] = [
  { name: "Ink", hex: "#ffffff", token: "text-foreground", use: "Headlines, body text, the primary pill." },
  { name: "Ink muted", hex: "#999999", token: "text-muted-foreground", use: "Secondary text. The only gray for text." },
  { name: "Pending", hex: "#5c5c5c", token: ".char-pending", use: "Prompt letters not typed yet. Nowhere else." },
];

const signals: Swatch[] = [
  { name: "Signal blue", hex: "#0099ff", token: "text-signal", use: "The agent, the shower score, focus rings." },
  { name: "Violet ink", hex: "#a594ff", token: "text-violet-ink", use: "The typing score and typing progress on dark." },
  { name: "Heat", hex: "#ff7a3d", token: "text-heat", use: "Streaks, a slow timer, third place." },
  { name: "Miss", hex: "#ff5577", token: "text-destructive", use: "Wrong letters, errors, a very slow timer." },
  { name: "Magenta ink", hex: "#e58af7", token: "text-magenta-ink", use: "Defined but not used yet. Ask first.", unused: true },
  { name: "Success", hex: "#22c55e", token: "text-success", use: "Defined but not used yet. Ask first.", unused: true },
];

function Colors() {
  return (
    <Section
      id="color"
      title="Color"
      lead="Black and white do most of the work. Click a swatch to copy its Tailwind class."
    >
      <SwatchGroup label="Surfaces" swatches={surfaces} />
      <SwatchGroup label="Text" swatches={inks} />
      <SwatchGroup label="Signals" swatches={signals} />
    </Section>
  );
}

function SwatchGroup({ label, swatches }: { label: string; swatches: Swatch[] }) {
  return (
    <div className="grid gap-3">
      <Eyebrow>{label}</Eyebrow>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {swatches.map((swatch) => (
          <SwatchCard key={swatch.name} swatch={swatch} />
        ))}
      </div>
    </div>
  );
}

function SwatchCard({ swatch }: { swatch: Swatch }) {
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(swatch.token)}
      className={cn(
        "group grid overflow-hidden rounded-[20px] bg-card text-left ring-1 ring-border transition-transform duration-200 ease-[var(--ease-out)] active:scale-[0.98]",
        swatch.unused && "opacity-60",
      )}
    >
      <span className="h-24 border-b" style={{ background: swatch.hex }} />
      <span className="grid gap-1 p-4">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-medium">{swatch.name}</span>
          <span className="font-mono text-xs text-muted-foreground uppercase">{swatch.hex}</span>
        </span>
        <span className="flex items-center gap-1.5 font-mono text-xs text-signal">
          {copied ? <Check className="size-3" /> : <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />}
          {copied ? "Copied" : swatch.token}
        </span>
        <span className="text-[13px] leading-[1.4] text-muted-foreground">{swatch.use}</span>
      </span>
    </button>
  );
}

function Meaning() {
  return (
    <Section
      id="meaning"
      title="What color means"
      lead="A run has two halves, and each half has one color. Players learn the mapping in the first ten seconds, so keep it consistent everywhere, including the leaderboard."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="spotlight-violet on-spotlight bg-spotlight-violet gap-4 rounded-[20px] px-6 py-6 text-white ring-0">
          <Eyebrow className="text-white/80">Typing · violet</Eyebrow>
          <p className="font-display text-5xl font-medium tracking-[-0.05em] tabular-nums">+412</p>
          <p className="text-[15px] leading-[1.4] text-white/85">
            The prompt dock, typing points, the current turn pip, and every typing score use violet. On dark, use{" "}
            <Code onSpotlight>text-violet-ink</Code>.
          </p>
        </Card>
        <Card className="spotlight-water gap-4 rounded-[20px] bg-[#0a6fd6] px-6 py-6 text-white ring-0">
          <Eyebrow className="text-white/80">Agent and shower · blue</Eyebrow>
          <p className="font-display text-5xl font-medium tracking-[-0.05em] tabular-nums">+380</p>
          <p className="text-[15px] leading-[1.4] text-white/85">
            &ldquo;Agent is working,&rdquo; the countdown bar, being under the water, and every shower score use blue.
            On dark, use <Code onSpotlight>text-signal</Code>.
          </p>
        </Card>
      </div>
      <Card className="rounded-[20px]">
        <CardContent className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex gap-6">
            <Score label="Typing" value="2,480" className="text-violet-ink" />
            <Score label="Shower" value="3,115" className="text-signal" />
            <Score label="Total" value="5,595" />
          </div>
          <div className="grid gap-2">
            <p className="text-[13px] text-muted-foreground">The score bar in the play screen, and turn pips: done, typing now, agent now, not yet.</p>
            <div className="flex gap-2">
              <span className="gradient-fill h-1.5 w-7 rounded-full" />
              <span className="h-1.5 w-7 rounded-full bg-violet-ink" />
              <span className="h-1.5 w-7 rounded-full bg-signal" />
              <span className="h-1.5 w-7 rounded-full bg-accent" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

function Score({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="grid justify-items-end">
      <Eyebrow>{label}</Eyebrow>
      <span className={cn("font-mono text-xl tabular-nums", className)}>{value}</span>
    </div>
  );
}

const spotlights = [
  { className: "spotlight-violet", name: "Violet", job: "Typing. The prompt dock and typing points in flight." },
  { className: "spotlight-water", name: "Water", job: "Showering. The status card while you're under the water, and shower points." },
  { className: "spotlight-cartridge", name: "Cartridge", job: "Your pick. The selected session in the lobby, and second place." },
  { className: "spotlight-magenta", name: "Magenta", job: "Hype. The 3-2-1 countdown and first place." },
  { className: "spotlight", name: "Full spotlight", job: "The payoff. Only the final score card on the results screen." },
];

function Spotlights() {
  return (
    <Section
      id="spotlights"
      title="Spotlight cards"
      lead="These gradients are what make the game look like ours, so keep them rare. Each one is a single card with one job, and no more than two should be on screen at once."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {spotlights.map((spotlight) => (
          <CopyCard key={spotlight.className} value={spotlight.className} className={cn(spotlight.className, "text-white")}>
            <span className="font-display text-2xl font-medium tracking-[-0.03em]">{spotlight.name}</span>
            <span className="text-[15px] leading-[1.4] text-white/85">{spotlight.job}</span>
          </CopyCard>
        ))}
        <CopyCard value="gradient-fill" className="bg-card ring-1 ring-border">
          <span className="font-display text-2xl font-medium tracking-[-0.03em]">Gradient fill</span>
          <span className="text-[15px] leading-[1.4] text-muted-foreground">
            Thin strips only, like completed turn pips. Not a card background.
          </span>
          <span className="gradient-fill mt-2 h-1.5 w-full rounded-full" />
        </CopyCard>
      </div>
      <Note>
        Text on a spotlight is always white. Step it down with opacity (<Code>text-white/85</Code>,{" "}
        <Code>/80</Code>, <Code>/70</Code>), and add <Code>on-spotlight</Code> to any card that shows prompt letters.
      </Note>
      <Note>
        On a <Code>Card</Code>, also add the matching base color, like <Code>bg-spotlight-violet</Code> or{" "}
        <Code>bg-[#0a6fd6]</Code> for water, and <Code>ring-0</Code>. Otherwise the card&rsquo;s own{" "}
        <Code>bg-card</Code> wins and the gradient fades to black.
      </Note>
    </Section>
  );
}

function CopyCard({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className={cn(
        "flex min-h-44 flex-col gap-2 rounded-[20px] p-6 text-left transition-transform duration-200 ease-[var(--ease-out)] active:scale-[0.98]",
        className,
      )}
    >
      {children}
      <span className="mt-auto rounded-full bg-black/30 px-3 py-1 font-mono text-xs text-white">
        {copied ? "Copied" : `.${value}`}
      </span>
    </button>
  );
}

const typeScale = [
  {
    name: "Hero",
    sample: "Vibecodemaxxing",
    className: "font-display text-[clamp(3rem,7vw,5.3rem)] leading-[0.95] font-medium tracking-[-0.05em]",
    spec: "Mona Sans 500 · 48–85px · 0.95 · −0.05em",
    use: "The one headline per screen.",
  },
  {
    name: "Big number",
    sample: "8,240",
    className: "font-display text-[clamp(4rem,9vw,6.9rem)] leading-[0.85] font-medium tracking-[-0.05em] tabular-nums",
    spec: "Mona Sans 500 · 64–110px · 0.85 · −0.05em",
    use: "Final score, countdown.",
  },
  {
    name: "Title",
    sample: "Ship it before lunch",
    className: "font-display text-2xl font-medium tracking-[-0.03em]",
    spec: "Mona Sans 500 · 22–24px · −0.03em",
    use: "Section titles, session names.",
  },
  {
    name: "Lead",
    sample: "Type the prompt fast. While the agent works, get under the water and scrub.",
    className: "text-lg leading-[1.3] text-muted-foreground",
    spec: "Inter 400 · 18px · 1.3",
    use: "The sentence under a headline.",
  },
  {
    name: "Body",
    sample: "The next prompt appears when the agent finishes.",
    className: "text-[15px] leading-[1.4]",
    spec: "Inter 400 · 15px · 1.4",
    use: "Default reading text.",
  },
  {
    name: "Small",
    sample: "Prompt 2 of 3",
    className: "text-[13px] font-medium text-muted-foreground",
    spec: "Inter 500 · 13px",
    use: "Labels, helper text, errors.",
  },
  {
    name: "Eyebrow",
    sample: "Typing",
    className: "text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase",
    spec: "Inter 500 · 11px · +0.06em · uppercase",
    use: "Stat labels above numbers.",
  },
  {
    name: "Mono",
    sample: "make the button more ✨vibey✨",
    className: "font-mono text-[15px]",
    spec: "Geist Mono 400 · 13–24px",
    use: "Prompts, code, nicknames, timers, scores.",
  },
];

function Typography() {
  return (
    <Section
      id="type"
      title="Typography"
      lead="Three families. Mona Sans shouts, Inter explains, and Geist Mono is anything the player types or counts."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Mona Sans", "font-display", "Display and titles. Medium weight, always tight tracking.", "font-display"],
          ["Inter", "font-sans", "Body and UI. Character variants cv01, cv05, cv09, cv11, ss03 and ss07 are on globally.", "font-sans"],
          ["Geist Mono", "font-mono", "Prompts, code and numbers. Use tabular-nums for anything that ticks.", "font-mono"],
        ].map(([family, token, use, font]) => (
          <Card key={family} className="rounded-[20px]">
            <CardHeader>
              <p className={cn("text-5xl font-medium tracking-[-0.04em]", font)}>Aa</p>
              <CardTitle className="mt-3 text-[15px]">{family}</CardTitle>
              <CardDescription className="font-mono text-xs text-signal">{token}</CardDescription>
            </CardHeader>
            <CardContent className="text-[13px] leading-[1.4] text-muted-foreground">{use}</CardContent>
          </Card>
        ))}
      </div>
      <div className="grid divide-y rounded-[20px] bg-card ring-1 ring-border">
        {typeScale.map((row) => (
          <TypeRow key={row.name} row={row} />
        ))}
      </div>
      <Note>
        Tight tracking is part of the look. If a headline is too big on mobile, make it smaller and keep the negative
        tracking.
      </Note>
    </Section>
  );
}

function TypeRow({ row }: { row: (typeof typeScale)[number] }) {
  const [copied, copy] = useCopy();
  return (
    <div className="grid gap-3 p-5 md:grid-cols-[180px_1fr] md:gap-8">
      <div className="grid content-start gap-1">
        <span className="text-[15px] font-medium">{row.name}</span>
        <span className="text-[13px] text-muted-foreground">{row.use}</span>
        <span className="font-mono text-xs text-muted-foreground">{row.spec}</span>
        <button
          type="button"
          onClick={() => copy(row.className)}
          className="mt-1 w-fit font-mono text-xs text-signal hover:underline"
        >
          {copied ? "Copied classes" : "Copy classes"}
        </button>
      </div>
      <p className={cn("min-w-0 break-words", row.className)}>{row.sample}</p>
    </div>
  );
}

function TypingStates() {
  const prompt = "make it pop but, like, enterprise";
  const typed = "make it pip but";
  return (
    <Section
      id="typing"
      title="Typing states"
      lead="The prompt is the heart of the game. Letters have four states, and the classes live in globals.css."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="gap-3 rounded-[20px] px-5 py-5">
          <Eyebrow>On canvas</Eyebrow>
          <TypedPrompt prompt={prompt} typed={typed} />
        </Card>
        <Card className="spotlight-violet on-spotlight bg-spotlight-violet gap-3 rounded-[20px] px-5 py-5 text-white ring-0">
          <Eyebrow className="text-white/80">On spotlight · add .on-spotlight</Eyebrow>
          <TypedPrompt prompt={prompt} typed={typed} />
        </Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [".char-pending", "Not typed yet. #5c5c5c on canvas, white at 45% on a spotlight."],
          [".char-right", "Typed correctly. Full white."],
          [".char-wrong", "Typed wrong. Miss coral with a 2px underline, or pale pink on a spotlight."],
          [".char[data-caret]", "The next letter. A 2px signal-blue bar, white on a spotlight."],
        ].map(([token, use]) => (
          <div key={token} className="grid gap-1 rounded-[20px] bg-card p-4 ring-1 ring-border">
            <span className="font-mono text-xs text-signal">{token}</span>
            <span className="text-[13px] leading-[1.4] text-muted-foreground">{use}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TypedPrompt({ prompt, typed }: { prompt: string; typed: string }) {
  return (
    <p className="font-mono text-[clamp(18px,1.7vw,24px)] leading-[1.6] break-words" aria-label={prompt}>
      {Array.from(prompt).map((char, index) => {
        const state = index >= typed.length ? "char-pending" : typed[index] === char ? "char-right" : "char-wrong";
        return (
          <span key={index} className={cn("char", state)} data-caret={index === typed.length ? "" : undefined}>
            {char}
          </span>
        );
      })}
    </p>
  );
}

function Components() {
  return (
    <Section
      id="components"
      title="Components"
      lead="These are the shadcn components from apps/web/src/components/ui, restyled with our tokens. Import them instead of building new ones."
    >
      <Demo label="Buttons" note="Pills only. Put one white primary per view, and use size lg for main actions.">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg">Start</Button>
          <Button size="lg" variant="secondary">
            Practice without a camera
          </Button>
          <Button variant="outline">Change name or session</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="destructive">Reset scores</Button>
          <Button variant="link">Open the rules</Button>
          <Button size="lg" disabled>
            Waiting for the camera
          </Button>
        </div>
      </Demo>

      <Demo label="Badges" note="Short tags. Use signal blue only when a badge marks the player's own row.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="h-7 px-3 text-[13px]">
            Maximum vibes. Questionable code.
          </Badge>
          <Badge variant="secondary">Practice · not on the leaderboard</Badge>
          <Badge variant="outline" className="border-signal/50 text-signal">
            You
          </Badge>
          <span className="rounded-full bg-black/30 px-3 py-1 text-[13px] font-semibold text-heat tabular-nums ring-1 ring-border">
            ×3 streak
          </span>
          <span className="spotlight-violet rounded-full px-3 py-1 text-sm font-semibold text-white tabular-nums">
            +412 typing
          </span>
        </div>
      </Demo>

      <Demo label="Inputs" note="10px radius. Use mono for anything the player types.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <span className="text-sm font-medium text-muted-foreground">Name on the leaderboard</span>
            <Input placeholder="vibecoder_9000" className="h-11 rounded-[10px] bg-card px-3.5 font-mono text-[15px] dark:bg-card" />
            <Input
              defaultValue="the_most_unhinged_vibecoder"
              aria-invalid
              className="h-11 rounded-[10px] bg-card px-3.5 font-mono text-[15px] dark:bg-card"
            />
            <p className="text-[13px] text-destructive">Keep it to 24 characters.</p>
          </div>
          <div className="spotlight-violet grid content-start gap-2 rounded-[20px] p-5">
            <span className="text-[13px] font-medium text-white/80">On a spotlight</span>
            <Input
              placeholder="Type the prompt, then press Enter"
              className="h-12 rounded-[10px] border-white/15 bg-black/25 px-3.5 font-mono text-[15px] text-white placeholder:text-white/50 focus-visible:border-white/60 focus-visible:ring-white/25 dark:bg-black/25"
            />
          </div>
        </div>
      </Demo>

      <Demo label="Cards" note="20px radius, surface 1, hairline ring. A card turns into a spotlight only when it's that card's moment.">
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="gap-3 rounded-[20px] px-5 py-5 ring-signal/40">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-signal">Agent is working. Go scrub.</span>
              <span className="font-mono text-lg text-signal tabular-nums">4.2s</span>
            </div>
            <Progress value={58} className="h-2" indicatorClassName="bg-signal" />
            <p className="text-sm text-muted-foreground">92% accurate. The next prompt appears when the agent finishes.</p>
          </Card>
          <Card className="spotlight-water gap-3 rounded-[20px] bg-[#0a6fd6] px-5 py-5 text-white ring-0">
            <span className="text-[15px] font-medium">You&rsquo;re under the water.</span>
            <div className="grid gap-1.5">
              <div className="flex justify-between text-[13px] text-white/85 tabular-nums">
                <span>Scrubbing</span>
                <span>74%</span>
              </div>
              <Progress value={74} className="h-2 bg-white/20" indicatorClassName="bg-white" />
            </div>
          </Card>
        </div>
      </Demo>
    </Section>
  );
}

function Shape() {
  const radii = [
    ["Pill", "rounded-full", "Buttons, badges, chips, turn pips", "9999px"],
    ["Input", "rounded-[10px]", "Text fields", "10px"],
    ["Card", "rounded-[20px]", "Every card and spotlight", "20px"],
    ["Hero card", "rounded-[30px]", "The final score card only", "30px"],
  ];
  return (
    <Section id="shape" title="Shape and layout" lead="Round corners everywhere, with only four sizes.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {radii.map(([name, token, use, value]) => (
          <div key={name} className="grid gap-4 rounded-[20px] bg-card p-5 ring-1 ring-border">
            <div
              className="h-20 border-t-2 border-l-2 border-signal"
              style={{ borderTopLeftRadius: value === "9999px" ? 80 : value }}
            />
            <div className="grid gap-1">
              <span className="text-[15px] font-medium">{name}</span>
              <span className="font-mono text-xs text-signal">{token}</span>
              <span className="text-[13px] text-muted-foreground">{use}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Page width", "max-w-[1200px] mx-auto", "Pages are centered and never wider than 1200px."],
          ["Page padding", "px-6 md:px-10 py-12", "24px of padding on mobile and 40px from tablet up."],
          ["Gaps", "gap-3 · gap-6 · gap-10", "Use 12px between cards, 24px between groups, and 40px or more between sections."],
        ].map(([name, token, use]) => (
          <div key={name} className="grid gap-1 rounded-[20px] bg-card p-5 ring-1 ring-border">
            <span className="text-[15px] font-medium">{name}</span>
            <span className="font-mono text-xs text-signal">{token}</span>
            <span className="text-[13px] leading-[1.4] text-muted-foreground">{use}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

const keyframes = [
  { name: "pop", className: "animate-[pop_300ms_var(--ease-out)]", use: "A number or chip landing." },
  { name: "shake", className: "animate-[shake_320ms_var(--ease-out)]", use: "A word typed wrong." },
  { name: "rise", className: "animate-[rise_260ms_cubic-bezier(0.2,0.8,0.2,1)]", use: "A new transcript line." },
  { name: "nudge", className: "animate-[nudge_1.6s_var(--ease-out)_infinite]", use: "\u201cGet under the water\u201d when the player is dry." },
  { name: "blink", className: "animate-[blink_1s_infinite]", use: "A running tool call." },
];

function Motion() {
  return (
    <Section
      id="motion"
      title="Motion"
      lead="Fast and springy. Most motion lasts 200 to 500ms, starts quickly and settles softly. Reduced motion turns every animation off globally."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ["--ease-out", "cubic-bezier(0.23, 1, 0.32, 1)", "The default for everything that enters or responds."],
          ["--ease-in-out", "cubic-bezier(0.77, 0, 0.175, 1)", "For things that move from one place to another on screen."],
        ].map(([token, value, use]) => (
          <div key={token} className="grid gap-1 rounded-[20px] bg-card p-5 ring-1 ring-border">
            <span className="font-mono text-sm text-signal">{token}</span>
            <span className="font-mono text-xs text-muted-foreground">{value}</span>
            <span className="text-[13px] text-muted-foreground">{use}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {keyframes.map((frame) => (
          <KeyframeDemo key={frame.name} {...frame} />
        ))}
      </div>
      <div className="overflow-hidden rounded-[20px] ring-1 ring-border">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-card text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Moment</th>
              <th className="px-5 py-3 font-medium">Motion</th>
            </tr>
          </thead>
          <tbody className="divide-y font-mono text-xs">
            {[
              ["Hover, press, color change", "200–300ms · ease-out · press scales to 0.98–0.99"],
              ["Checkmark, point pop", "spring · 0.35–0.45s · bounce 0.3–0.5"],
              ["Countdown number", "spring · 0.4s · bounce 0.35 · scales in from 1.4"],
              ["Score counting up", "spring · 0.6s · bounce 0"],
              ["Results card entering", "0.5s · ease-out · rises 12px, scales from 0.98"],
              ["Leaderboard rows", "0.3s · ease-out · 40ms stagger"],
            ].map(([moment, spec]) => (
              <tr key={moment}>
                <td className="px-5 py-3 font-sans text-[13px]">{moment}</td>
                <td className="px-5 py-3 text-muted-foreground">{spec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        The game clock never waits for an animation. If an animation would delay the next prompt, make it shorter or
        remove it.
      </Note>
    </Section>
  );
}

function KeyframeDemo({ name, className, use }: { name: string; className: string; use: string }) {
  const [run, setRun] = useState(0);
  return (
    <button
      type="button"
      onClick={() => setRun((count) => count + 1)}
      className="grid gap-4 rounded-[20px] bg-card p-5 text-left ring-1 ring-border transition-colors duration-200 hover:bg-accent"
    >
      <span className="grid h-16 place-items-center">
        <span key={run} className={cn("spotlight-violet rounded-full px-3 py-1 text-sm font-semibold text-white", className)}>
          +128
        </span>
      </span>
      <span className="grid gap-1">
        <span className="font-mono text-sm text-signal">@keyframes {name}</span>
        <span className="text-[13px] leading-[1.4] text-muted-foreground">{use}</span>
        <span className="text-xs text-muted-foreground/70">Click to replay</span>
      </span>
    </button>
  );
}

function Voice() {
  const pairs = [
    ["Agent is working. Go scrub.", "Please wait while the AI agent processes your request."],
    ["Waiting for the camera", "Camera initialization in progress…"],
    ["Try it: step under the water.", "Position yourself within the detection zone."],
    ["Practice runs don't go on the leaderboard.", "Note: Scores achieved in practice mode are not eligible."],
  ];
  return (
    <Section
      id="voice"
      title="Voice and copy"
      lead="We talk like a friend who's in on the joke: short, direct and a little unhinged. The joke goes in the content, while instructions stay plain."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Sentence case", "Only the first word and names get capitals: \u201cPlay again\u201d, not \u201cPlay Again\u201d."],
          ["Say what happens", "Buttons name the action: Start, Play again, Practice without a camera."],
          ["Talk to the player", "Use \u201cyou\u201d. Say what to do next, not what went wrong inside the app."],
        ].map(([title, body]) => (
          <div key={title} className="grid gap-1 rounded-[20px] bg-card p-5 ring-1 ring-border">
            <span className="text-[15px] font-medium">{title}</span>
            <span className="text-[13px] leading-[1.4] text-muted-foreground">{body}</span>
          </div>
        ))}
      </div>
      <div className="grid divide-y rounded-[20px] bg-card ring-1 ring-border">
        {pairs.map(([good, bad]) => (
          <div key={good} className="grid gap-3 p-5 md:grid-cols-2">
            <p className="flex items-start gap-2.5 text-[15px]">
              <Check className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={3} />
              {good}
            </p>
            <p className="flex items-start gap-2.5 text-[15px] text-muted-foreground line-through decoration-destructive/60">
              <X className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={3} />
              {bad}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Rules() {
  const dos = [
    "Build on canvas, card and muted. Show depth by stepping up a surface.",
    "Use one white pill per view for the main action.",
    "Keep violet for typing and blue for the agent and the shower, everywhere.",
    "Put numbers that change in Geist Mono with tabular-nums.",
    "Import the components from components/ui and restyle them with className.",
    "Test with reduced motion on. The screen should still make sense.",
  ];
  const donts = [
    "Don't add a light mode or a light section.",
    "Don't fill a whole section with a gradient. Gradients are cards.",
    "Don't make a blue or violet primary button. Signal colors aren't fills.",
    "Don't invent new grays. Text is white, #999 or white with opacity on a spotlight.",
    "Don't square off buttons or use bordered ghost buttons as the main action.",
    "Don't loosen headline tracking. Make the text smaller instead.",
  ];
  return (
    <Section id="rules" title="Do and don't" lead="A checklist to run before you open a PR.">
      <div className="grid gap-3 md:grid-cols-2">
        <RuleList title="Do" items={dos} good />
        <RuleList title="Don't" items={donts} />
      </div>
    </Section>
  );
}

function RuleList({ title, items, good }: { title: string; items: string[]; good?: boolean }) {
  const Icon = good ? Check : X;
  return (
    <Card className="gap-4 rounded-[20px] px-6 py-6">
      <p className={cn("font-display text-2xl font-medium tracking-[-0.03em]", good ? "text-signal" : "text-destructive")}>
        {title}
      </p>
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[15px] leading-[1.4]">
            <Icon className={cn("mt-0.5 size-4 shrink-0", good ? "text-signal" : "text-destructive")} strokeWidth={3} />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none font-medium tracking-[-0.05em]">{title}</h2>
        <p className="text-lg leading-[1.3] text-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function Demo({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 rounded-[20px] p-6 ring-1 ring-border">
      <div className="grid gap-1">
        <Eyebrow>{label}</Eyebrow>
        <p className="text-[13px] text-muted-foreground">{note}</p>
      </div>
      {children}
    </div>
  );
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase", className)}>
      {children}
    </span>
  );
}

function Code({ children, onSpotlight }: { children: ReactNode; onSpotlight?: boolean }) {
  return (
    <code
      className={cn(
        "rounded-md px-1.5 py-0.5 font-mono text-[0.9em] whitespace-nowrap",
        onSpotlight ? "bg-black/30 text-white" : "bg-card text-foreground ring-1 ring-border",
      )}
    >
      {children}
    </code>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-2xl border-l-2 border-signal pl-4 text-[15px] leading-[1.4] text-muted-foreground">{children}</p>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = (value: string) => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return [copied, copy] as const;
}
