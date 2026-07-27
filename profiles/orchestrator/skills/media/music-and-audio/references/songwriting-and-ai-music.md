# Songwriting & AI Music Generation

## Song Structure (common skeletons)
- ABABCB: Verse/Chorus/Verse/Chorus/Bridge/Chorus (most pop/rock)
- AABA: Verse/Verse/Bridge/Verse (jazz standards, ballads)
- ABAB: Verse/Chorus alternating (simple)
- AAA: Strophic, no chorus (folk, storytelling)

## Rhyme Types
- Perfect: lean/mean
- Family: crate/braid
- Assonance: had/glass (same vowels)
- Consonance: scene/when (similar endings)
- Near/slant: enough to suggest connection

## Emotional Arc
Whisper → build → roar → whisper back. Use dynamic contrast.

## Suno AI Prompt Engineering

### Style Field Formula
```
Genre + Mood + Era + Instruments + Vocal Style + Production + Dynamics
```
Describe the JOURNEY: "Begins as a haunting whisper over sparse piano. Gradually layers in muted brass. Builds through the chorus with full orchestra. Outro strips back to a lone piano."

V4.5+ supports 1000 chars. No artist names/trademarks.

### Metatags (in lyrics field, [brackets])
Structure: `[Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Outro]`
Vocals: `[Whispered] [Belted] [Falsetto] [Soulful] [Raspy] [Harmonies] [Choir]`
Dynamics: `[High Energy] [Building Energy] [Explosive] [Emotional Climax]`
Atmosphere: `[Melancholic] [Euphoric] [Dreamy] [Dark Atmosphere]`
Gender: `[Female Vocals] [Male Vocals]`

### Phonetic Tricks for AI Vocalists
- Spell words as they sound: "through" → "thru", "Nous" → "Noose"
- ALL CAPS = louder
- "lo-o-o-ove" = sustained/melisma
- Spell out numbers: "24/7" → "twenty four seven"
- Space acronyms: "AI" → "A I"

### Workflow
1. Write the hook/concept first
2. If parody: map original syllable/rhyme/stress structure
3. Generate raw material freely before structuring
4. Draft lyrics → read/sing aloud → fix meter
5. Build Suno style with dynamic arc
6. Add metatags for performance direction
7. Generate 3-5 variations (revision is normal)
