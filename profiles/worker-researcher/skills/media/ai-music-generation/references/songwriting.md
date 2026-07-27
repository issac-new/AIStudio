# Songwriting Craft & Suno AI Prompts

Everything here is a GUIDELINE, not a rule. Art breaks rules on purpose.

## Song Structure

Common skeletons:
- **ABABCB** — Verse/Chorus/Verse/Chorus/Bridge/Chorus (most pop/rock)
- **AABA** — Verse/Verse/Bridge/Verse (jazz standards, ballads)
- **ABAB** — Verse/Chorus alternating (simple, direct)
- **AAA** — Strophic, no chorus (folk, storytelling)

Building blocks: Intro → Verse → Pre-Chorus → Chorus → Bridge → Outro

## Rhyme, Meter, and Sound

**Rhyme types** (mix them — all perfect sounds like a nursery rhyme):
- **Perfect:** lean/mean
- **Family:** crate/braid
- **Assonance:** had/glass (same vowels, different endings)
- **Consonance:** scene/when (different vowels, similar endings)
- **Near/slant:** enough to suggest connection

**Internal rhyme:** Rhyming within a line creates density.
- "We pruned the lies from bleeding trees / Distilled the storm from entropy"

**Meter:** The rhythm of stressed vs unstressed syllables. Matching syllable counts between parallel lines helps singability.

## Emotional Arc

Think of a song as a journey. Energy mapping:
```
Intro: 2-3 | Verse: 5-6 | Pre-Chorus: 7 | Chorus: 8-9 | Bridge: varies | Final Chorus: 9-10
```
The most powerful dynamic trick: **CONTRAST.** Whisper before a scream. Sparse before dense. Silence is an instrument.

## Lyrics Craft

- **Show, don't tell:** "Your hoodie's still on the hook by the door" > "I was sad"
- **The hook:** The line people remember — usually the title or core phrase
- **Prosody:** Stable feelings pair with settled melodies, perfect rhymes, resolved chords. Unstable feelings pair with wandering melodies, near-rhymes, unresolved chords.

## Parody Adaptation

1. Map original structure: syllables per line, rhyme scheme, stressed syllables
2. Match stressed syllables to song's beats
3. On long held notes, match the VOWEL SOUND
4. Monosyllabic swaps in key spots keep rhythm intact (Crime → Code)
5. Keep some original lines for recognizability

## Suno AI Prompt Engineering

### Style/Genre Description Formula
```
Genre + Mood + Era + Instruments + Vocal Style + Production + Dynamics
```
**Bad:** "sad rock song"
**Good:** "Cinematic orchestral spy thriller, 1960s Cold War era, smoky sultry female vocalist, big band jazz, brass section with trumpets and french horns, sweeping strings, minor key, vintage analog warmth"

**Describe the journey:**
"Begins as a haunting whisper over sparse piano. Gradually layers in muted brass. Builds through the chorus with full orchestra. Outro strips back to a lone piano and a fragile whisper fading to silence."

**Tips:** No artist names (describe instead). V4.5+ supports 1000 chars. Use Exclude Styles. Unexpected genre combos are gold (bossa nova trap, Appalachian gothic, chiptune jazz).

### Metatags (in [brackets] inside lyrics field)

**Structure:** `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Outro]`, `[Instrumental]`, `[Guitar Solo]`, `[Breakdown]`, `[Build-up]`

**Vocal:** `[Whispered]`, `[Spoken Word]`, `[Belted]`, `[Falsetto]`, `[Soulful]`, `[Raspy]`, `[Breathy]`, `[Harmonies]`, `[Choir]`

**Dynamics:** `[High Energy]`, `[Low Energy]`, `[Building Energy]`, `[Explosive]`, `[Emotional Climax]`, `[Gradual swell]`

**Atmosphere:** `[Melancholic]`, `[Euphoric]`, `[Nostalgic]`, `[Aggressive]`, `[Dreamy]`, `[Intimate]`, `[Dark Atmosphere]`

**Gender:** `[Female Vocals]`, `[Male Vocals]`

Keep to 5-8 tags per section max.

### Phonetic Tricks for AI Vocalists

Spell words as they SOUND: "through" → "thru", "Nous" → "Noose". ALL CAPS = louder. "lo-o-o-ove" = sustained melisma. Spell out numbers: "24/7" → "twenty four seven".
