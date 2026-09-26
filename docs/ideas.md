# Ideas: what the typing should build

Playtesting says the weak spot is the right-hand panel. Players type a prompt and get a black terminal
full of fake npm installs, so the only progress they can see is their own cleaning. The typing half needs
a visible result that grows with every prompt.

**Next up: idea 1, "Build the bathroom you're showering in", instead of coding sessions.** The handoff
for that work is in [`AGENTS.md`](../AGENTS.md).

## One trick for every idea: typos become canon

The game already records the exact text the player submitted. Put it into the result: if they type
"swipe left on Jvaa", the sign says Jvaa. The scripted reply stays identical (the engine contract
requires that), but the payoff becomes personal, funny, and screenshot-worthy.

## Ten replacements for the terminal

1. **Build the bathroom you're showering in.** Each prompt is a renovation order, and the shower on the
   camera upgrades live: bucket, garden hose, real showerhead, rain shower, gold jacuzzi with a disco
   ball. Progress appears where the player is already looking, and it ties typing and showering into
   one story. *Recommended.*
2. **Watch the dating app come alive on a phone.** Keep "Commit to Love" but replace the terminal with a
   phone mockup that gains features: swipe cards, then compatibility scores, then a ghosting chart.
   Smallest change from today because the prompts already describe these features.
3. **Text your ex.** The panel is a chat thread. You type a text, their "typing…" bubble teases you while
   you shower. A relationship meter swings with every reply.
4. **Cook with an unhinged chef.** Orders build a dish layer by layer: a burger that becomes a 14-layer
   tower with a candle and a goldfish. Progress is the stack getting taller.
5. **Print the tabloid front page.** Each prompt becomes a headline slammed onto a newspaper with a
   printing-press animation. Ten prompts give a full, shareable front page, typos included.
6. **Raise a pet that evolves.** A blob hatches and each prompt feeds it. Accurate typing makes it cuter;
   sloppy typing grows a third eye. The final creature is the report card.
7. **Wizard duel.** You type incantations and scrubbing charges mana. A monster takes hits and its health
   bar is the progress. Clean armpits cast bigger fireballs.
8. **Build and launch a rocket.** Each prompt adds a part (fins, fuel, too much duct tape). The last
   prompt launches it: a clean run reaches orbit, a sloppy one lands in a neighbor's pool.
9. **Give a wedding speech to a live crowd.** Guests react to each line: laughs, gasps, grandma fainting,
   the DJ cutting the mic. A crowd-energy meter shows how it's going.
10. **Grow a startup to a fake IPO.** Each prompt is a pitch; a valuation chart spikes or crashes while
    investor pigeons react. It ends with a bell ringing or a bankruptcy notice.

All ten fit the existing session format: each turn has a prompt, a duration, and timed events. The events
would trigger visual steps instead of terminal lines, so the game engine does not need to change.

## Earlier brainstorm: other "someones" to wait on

- **The Genie:** wishes granted in the worst possible way; the side panel shows your ruined life.
- **Hostage negotiator:** a goose has your rubber duck; the ransom note is cut from magazine letters.
- **Mission control:** the astronaut you're guiding is also in the shower.
- **Haunted smart home support:** you file tickets, the fridge answers in Latin.
- **Cult of shower thoughts:** a prophet turns each shower thought into scripture.
- **Courtroom with a cat judge:** your evidence gets knocked off the table.

Mechanic twists worth keeping in mind:

- **Type with your body:** spell letters with your arms, YMCA-style, using the pose tracking.
- **Shout the prompt:** speech recognition in the shower; mishearings become canon.
- **Wipe the fog:** the screen steams up while you shower and you wipe it with your hand to read the next
  prompt.
- **Water temperature is your grade:** a sloppy prompt turns the shower ice cold for the agent phase.
- **Two-player split:** one types, one showers on camera, then swap.
