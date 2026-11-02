# Listening experience review

What this repo does: Thug Archive is a small, invite-only music library with personal playlists and shared listening. This review assumes a private group, not a public social network. The priority is choosing a song, playing it, saving it and sharing it with someone.

Reviewed directly in Codex using the requested Ponytail audit and VectorLab UX audit workflows. Implementation agents handled isolated features; no reviewer agents, external review CLIs or paid review APIs were used. The supplied photos are design prompts, not instructions embedded in the application or universal scientific rules.

## The whole experience

The original problem was competing information. Research provenance, speculative eras, instrument estimates, artist roles, repeated credits and editing buttons all competed with the song. Removing those distractions together produces a more useful listening interface than changing each annotation in isolation.

Home now starts with Liked songs and Build your own, with three understandable pace/energy choices below. Song rows show the title and available performer/version information once. Research remains internal. Filters offer pace/energy and artists, ordered by matching quantity. A song's menu contains listening actions, sharing, alternate versions and Similar songs. The pencil opens a dedicated playlist editor; reordering is temporary until Save.

Friends provides a member directory, requests, accepted-friend conversations, song attachments and room invitations. Song links retain the exact recording through sign-in and contain no signed audio URL. They require archive membership.

## Annotation decisions

| Annotation | Implemented outcome |
|---|---|
| 1. Sidebar ends early | Full-height sidebar without a player; measured player-height clearance with a player; scrolling makes account controls reachable on short desktops. |
| 2. Reorder discovery | Liked songs first, Build your own second, pace/energy choices underneath. |
| 3. Overlapping ordering buttons | Removed permanent row editing. Pencil opens a complete editor with row dragging, touch grip, keyboard moves, removal, Save and Cancel. |
| 4. Dense row context | Removed era, evidence and sound-estimate paragraphs from rows and the player. |
| 5. Artificial instrument groups | Removed guitar-like/keyboard-like/synth-like filter categories. |
| 6. Bloated menu | Reduced filters to two useful sections; compact rows and a reachable results button. |
| 7. Quantity ordering | Counts descend within each filter section, with alphabetical ties. |
| 8. Evidence filter | Removed from listener UI and production imports. |
| 9. Spreadsheet header | Removed column headings and the duplicate artist column. |
| 10. Similar tones | Kept a simple Similar songs action; technical analysis stays internal. |
| 11. Social connection | Added member search, requests, private conversations, blocking and invitations to listening rooms. |
| Added song-sharing request | Native share sheet where supported, copy link with visible confirmation, and an in-app song attachment with optional text. |

## Photo one: twenty visual warnings

| Item | Applicability and decision |
|---|---|
| 1. Purple-to-blue gradient | Not present. Preserve the charcoal, olive and lime palette. |
| 2. Gradient hero text | Not present. Plain headings remain. |
| 3. Emoji headings | Not present. Do not add decoration. |
| 4. Inter everywhere | A font name is not a usability defect. Keep the existing readable sans-serif system; fix hierarchy and size instead. |
| 5. Colored border cards | Apply selectively. Neutral list frames organize songs; lime is reserved for selection, playback, focus and important actions. |
| 6. Glass cards | No new translucent card system. Existing opaque list surfaces provide structure. |
| 7. Low-contrast dark mode | Applicable. Check actual text against the dark surfaces, including disabled, muted and focus states. |
| 8. Three icon boxes in a row | Avoid generic feature tiles. The pace choices are compact controls with a purpose. |
| 9. Badge above headline | Applicable. Removed decorative eyebrow labels from the main listening pages. |
| 10. Lucide everywhere | Keep the installed icon language for recognizable actions. Removing useful play/heart/share icons would reduce familiarity. |
| 11. Untouched shadcn UI | Not applicable; the app uses Preact and its own components. |
| 12. Fade-in on scroll | Not present; do not add it. Songs should appear immediately. |
| 13. Cursor-following beam | Not present; irrelevant to listening. |
| 14. Buttons fade on hover | Enabled controls retain readable text and recognizable surfaces. Disabled state remains distinct. |
| 15. Inconsistent spacing | Applicable. Use consistent row targets, modal gutters and grouped controls; remove the sidebar gap and overlapping actions. |
| 16. Em dashes everywhere | Copy is short and direct. Punctuation is not a substitute for useful wording. |
| 17. Generic buzzwords | Applicable. Removed redundant top-bar slogans and explanatory catalog prose. |
| 18. Serif italic accents | Not present; no reason to introduce them. |
| 19. Space Grotesk + Instrument Serif | Not used. No font overhaul is needed. |
| 20. Grain over gradient | Not present. Keep the listening canvas quiet. |

## Photo two: twenty UX principles

| Item | Applicability and decision |
|---|---|
| 1. Hick's law | Strongly useful: fewer top-level choices, compact filters and a clear song menu. |
| 2. Fitts's law | Strongly useful: 44px targets, separated actions and a large draggable row/grip. |
| 3. Jakob's law | Strongly useful: familiar play, like, queue, playlist, share and friend-request patterns. |
| 4. Miller's law | Useful as a reminder to group information, not a literal seven-item menu quota. Memory capacity depends on task and chunking. |
| 5. Aesthetic-usability effect | Useful: consistent surfaces and spacing help, but do not substitute for working saves and playback. |
| 6. Pareto principle | Useful prioritization heuristic: emphasize listening, saving and sharing. No invented claim that analytics proved an 80/20 split. |
| 7. Occam's razor | Useful: remove unnecessary choices and reuse existing components. Preserve the validation and access checks that the system needs. |
| 8. Parkinson's law | A project constraint, not a listener feature. Keep the release scoped; do not impose timers on users. |
| 9. Postel's law | Search accepts familiar filename aliases and punctuation variants. Security boundaries remain strict about IDs, membership and message limits. |
| 10. Peak-end rule | Make starting playback and completing a share/save clear. Do not add celebration effects to routine music actions. |
| 11. Von Restorff effect | Reserve accent color for current selection and primary actions. Do not highlight every card. |
| 12. Zeigarnik effect | Save state and visible progress matter during real work. No artificial unfinished tasks or engagement streaks. |
| 13. Tesler's law | Strongly useful: acoustic analysis and provenance belong behind the interface; listeners see the resulting useful action. |
| 14. Doherty threshold | Provide immediate button/loading feedback. A fixed 400ms slogan does not guarantee network or streaming performance. |
| 15. Goal-gradient effect | Relevant to upload progress and saving, not to pressuring people to finish a playlist. |
| 16. Proximity | Keep title/performers together, playback actions together and conversation controls near the message. |
| 17. Similarity | Consistent row layouts, button styles and icon meanings. |
| 18. Closure | Fix incomplete-looking edges and the sidebar/player seam. Avoid ornamental incomplete shapes. |
| 19. Common region | Use simple list and conversation containers. Avoid a separate card around every filter choice. |
| 20. Connectedness | Keep a shared song visibly attached to its message. Decorative connecting lines would add clutter. |

The memory-card wording is intentionally treated cautiously: [Cowan's capacity review](https://pubmed.ncbi.nlm.nih.gov/11515286/) discusses conditions affecting memory limits; it does not establish a universal menu length.

## Findings addressed during direct self-review

1. **The sidebar could overlap a taller player.** Its old fixed offset did not match the actual controls. A ResizeObserver now supplies the real dock height; short sidebars scroll. Browser geometry matched the sidebar bottom to the player top.
2. **Copy confirmation was outside the sharing dialog.** A global toast can sit behind a native modal. The copy button now changes to Link copied inside the dialog; this was checked in the browser.
3. **A new playlist briefly showed the full archive.** Navigation could precede the refreshed playlist read. The successful returned playlist is inserted into local state before navigation, then refreshed normally.
4. **Raw export text polluted titles and artist choices.** A pure presentation projection removes unambiguous numbering/production suffixes and extracts only complete explicit filename performers. Original values remain stored, and original titles remain searchable aliases. Partial names are not guessed.
5. **Versions and duplicate save labels added noise.** Alternate versions remain distinct and accessible from the song menu. Existing playlists now say Save as new playlist for the copy action.
6. **Validation feedback could be hidden in a modal.** Playlist-name validation and creation errors now appear in the form. Editing clears the message; failed saves keep the draft.

## Verification and limits

Phase one: 51 client tests, configured production build, bundle exclusions and rolled-back database fixtures passed. Pages run 41429163218 deployed commit 5db5761; downloaded JavaScript and CSS matched the local build byte for byte. Live home and member-directory reads succeeded. No requests or messages were sent to real people.

Phase two: all 58 client tests, TypeScript, configured production build and bundle exclusions pass. Browser checks used isolated preview data at 375, 638, 1280 and 1730px, including a short phone viewport. Song titles computed at 16px; visible home buttons met 44px targets; reduced motion produced zero-duration transitions. Keyboard dialog close returned focus, empty search recovered, playlist saves persisted, and the sidebar/player edges aligned. New playlist validation stays inside the dialog. Screenshots are retained privately under `.local/qa`.

The private acoustic pilot sampled 297 recordings / 1,782 mixed excerpts; a 61-recording subset supplied 366 vocal-separated excerpts. Two existing model families were tested against work-disjoint reference, calibration and test groups. The strongest exploratory forced-choice run agreed with weak Thug/Uzi catalog labels on 57/60 passages. A calibration-selected, less strict setting accepted 39/60 known passages with no observed test errors, while rejecting 18/18 withheld-artist passages. A different separated-vocal run falsely accepted a Pooh Shiesty-tagged passage as Thug. These are small, correlated weak-label comparisons, not verified identity accuracy. No automatic artist-credit changes were made.

The portable private report contains 116 four-second clips, including matches, rejected passages and mistakes beside their closest references. Root verified actual four-second media playback and responsive report rendering. The existing musical-tone Similar songs map remains: voice identity neighbors were materially different and did not demonstrate a listening benefit. Source hashes, pinned model revisions, split manifests and reproduction scripts remain private. No original audio was uploaded to a model provider.

Physical iPhone Safari/Home Screen behavior, native share delivery to another person's device, screen-reader operation and listening judgments by a human remain separate from desktop viewport and source checks. This is direct self-review, not independent review or accessibility certification.
