# Design lock

Audience: two friends using an iPhone-first personal music library.
Direct build authorized in the conversation, using Apple Music/Spotify interaction
patterns and a distinct archive identity.

Research: Refero styles and Mobbin library search both returned paid-subscription
requirements on 2026-10-25. No upgrades made. Fallback references: Apple's playlist
guide (https://support.apple.com/guide/iphone/iph21addc265/ios), Apple's music playback
guide (https://support.apple.com/guide/iphone/iph0138fb328/ios), and the Refero skill's
bundled anti-ai-slop and craft-details references. No screenshot reference was available.

Primary direction: charcoal listening room, dense useful rows, editorial archive sleeve
art. Preserve an off-white title hierarchy, subtle dividers, lime play controls, always
visible player, mobile bottom tabs. Borrow Apple's library/playlist organization and
Spotify's queue and mini-player interactions, without copying logos or branded assets.

Tokens: #111210 canvas; #191b18 surface; #f4f3ec text; #a6aca1 secondary;
#c7f36a accent for play, selection, focus. 8px layout rhythm, 44px touch targets.
System sans for controls, condensed heavy system display for collection titles.
Artwork: original typographic SVG archive sleeves; embedded artwork replaces these
after media import. Collection sleeves describe factual groups, not invented eras/moods.
Avoid glass panels, fake stats, ornamental dashboards, and unrelated generated covers.

Production: private data loads only after login. Local preview is explicitly labeled,
development-only, and has separate local storage. Missing audio must show a useful
message, never simulate playback. Native dialogs trap focus and support Escape.
