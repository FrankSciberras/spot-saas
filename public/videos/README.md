# Homepage hero video

The homepage hero plays a self-hosted video when these files exist, and falls
back to the YouTube embed (which YouTube serves at whatever quality it likes,
usually not HD for muted autoplay) when they don't.

Put the demo here as:

    hero.mp4    REQUIRED — H.264 (High profile), AAC or no audio track, 1920×1080,
                30 fps, ~3–4 Mbps. Keep it under ~20 MB: it loads on first paint.
    hero.webm   OPTIONAL — VP9 or AV1 at ~2 Mbps; browsers that support it pick
                this first, so the page gets lighter for most visitors.
    hero.jpg    REQUIRED — a 1920×1080 poster frame (JPEG, ~150 KB). Shown while
                the video buffers and to visitors with "reduce motion" enabled.

Handy ffmpeg commands from the original export (run in this folder):

    ffmpeg -i source.mp4 -an -vf "scale=1920:-2,fps=30" -c:v libx264 -profile:v high -crf 23 -preset slow -movflags +faststart hero.mp4
    ffmpeg -i source.mp4 -an -vf "scale=1920:-2,fps=30" -c:v libvpx-vp9 -b:v 2M -deadline good hero.webm
    ffmpeg -i source.mp4 -ss 00:00:02 -frames:v 1 -q:v 3 hero.jpg

The video is muted and loops, so an audio track is dead weight — `-an` drops it.
