# Homepage walkthrough video

The homepage "Watch the walkthrough" button opens a modal that plays this
self-hosted video when these files exist, and falls back to the YouTube embed
when they don't. It only loads once the visitor opens the modal.

Put the demo here as:

    hero.mp4    REQUIRED — H.264 (High profile), AAC or no audio track, 1920×1080,
                30 fps, ~3–4 Mbps. Keep it under ~20 MB.
    hero.webm   OPTIONAL — VP9 or AV1 at ~2 Mbps; browsers that support it pick
                this first, so the page gets lighter for most visitors.
    hero.jpg    REQUIRED — a 1920×1080 poster frame (JPEG, ~150 KB). Shown while
                the video buffers and to visitors with "reduce motion" enabled.

Handy ffmpeg commands from the original export (run in this folder):

    ffmpeg -i source.mp4 -an -vf "scale=1920:-2,fps=30" -c:v libx264 -profile:v high -crf 23 -preset slow -movflags +faststart hero.mp4
    ffmpeg -i source.mp4 -an -vf "scale=1920:-2,fps=30" -c:v libvpx-vp9 -b:v 2M -deadline good hero.webm
    ffmpeg -i source.mp4 -ss 00:00:02 -frames:v 1 -q:v 3 hero.jpg

The original export has no narration, so `-an` drops the audio track. If a
narrated version is made, leave `-an` out: the modal plays it with sound.
