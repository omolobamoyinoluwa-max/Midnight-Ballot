# Demo video script — Midnight Ballot

Target runtime **1:45–2:00**. Narration is word-for-word and timed; read it at a normal
pace and the action cues will line up.

## Before you hit record

- **https://midnight-ballot-one.vercel.app** open in a fresh tab, nothing else open.
- **Lace wallet** unlocked and switched to **Preprod**.
- The election already has **at least one vote** so the tally visibly increments at 1:30.
- Browser zoom at **110%** so the tallies are legible on a phone-sized player.
- Microphone level checked; record in one take if you can — small slips are fine.

---

## 0:00–0:25 · Connect the wallet

**On screen:** click **Connect Lace wallet**, approve it in Lace, let the address render.

> This is Midnight Ballot, running on Midnight's Preprod network. It's a voting app where
> the tally is public, but your vote isn't. Let me connect my Lace wallet — it's already on
> Preprod. Approving... and there's my wallet address, on screen, connected.

## 0:25–0:45 · What the world can see

**On screen:** move the cursor across the tally panel, then the election facts.

> Everything in this panel is public. Anyone can read it off the chain: the election name,
> the total number of ballots, and the two candidate tallies. What's *not* here is anything
> that identifies a voter, or what any individual ballot contained.

## 0:45–1:20 · Call the circuit (the proof)

**On screen:** click **Vote Candidate A**. Let the loading state run and let the stage text
change — hold on it, this is the beat that matters.

> Now I'll cast a ballot. And this is the important part — watch the loading state. It says
> "Generating zero-knowledge proof locally". My browser is computing a proof that I hold a
> valid voter credential, that I haven't already voted, and that my choice is valid. My
> private credential is *never* sent anywhere. The proof is what goes to the chain. The
> input stays here, on my machine.

## 1:20–1:40 · On-chain result

**On screen:** let the result card appear. Read it, then click **refresh** in the tally panel
and let the counter tick up.

> And it's finalized. Transaction id, block height... and this last field is the nullifier —
> a one-way hash of my private credential. That's what lets the contract reject a second
> vote from me without ever knowing who I am. It can't be reversed back to my identity. And
> you can see the tally just went up.

## 1:40–1:55 · The privacy claim

**On screen:** scroll to the **Privacy model** panel. End on the public/private columns.

> And to be explicit, because this is the whole point: the private input was never displayed
> anywhere in this interface. There's no field for my voter credential, no way to reveal it.
> It never left this browser. That's what "proved without revealing your input" means here.

---

## Optional bonus (10 s) — only if you have time left

Still under 2 minutes? This is the strongest possible ending, because it proves the guard
is real rather than just claimed:

**On screen:** click **Vote Candidate B**, let it fail, and read the rejection.

> Let me try to vote twice. The contract rejects it — "already cast a ballot" — because my
> nullifier is already spent. One voter, one vote.

**On screen:** click **new voter credential**, then vote again successfully.

> And now I'll mint a fresh credential. That's a second, genuinely unlinkable voter — even
> though it's the same browser and the same wallet. Nothing on-chain links those two
> ballots.

---

## What not to show

The audit criterion is that the private input never appears — so:

- Never open DevTools → Application → Local Storage. The credential is stored there, in the
  clear, by design (so a reload doesn't silently mint a new voter). Showing it would
  undercut the claim you're demonstrating.
- Don't read the raw local-storage value aloud or paste it anywhere on screen.
- The nullifier **is** safe to show: the contract publishes it on-chain anyway, and it is a
  one-way hash. That's why it's in the result card.
