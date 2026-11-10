// Runs in the page itself (world "MAIN"), because the player's data is not visible from the
// isolated world of a content script. It answers `deuchan:request` with the data of the video that
// is open, and never writes to the page.
window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.type !== "deuchan:request") {
    return;
  }
  const response = document.getElementById("movie_player")?.getPlayerResponse?.();
  const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  // The audio that is playing: a dubbed video has one for each language, and YouTube picks the viewer's
  let audioTrackId = null;
  try {
    const id = document.getElementById("movie_player")?.getAudioTrack?.()?.id;
    audioTrackId = typeof id === "string" ? id : null;
  } catch {
    // an older player has no such thing: the other clues decide
  }
  window.postMessage(
    {
      type: "deuchan:video",
      audioTrackId,
      videoId: response?.videoDetails?.videoId ?? null,
      title: response?.videoDetails?.title ?? "",
      description: response?.videoDetails?.shortDescription ?? "",
      captionTracks: tracks.map((track) => ({ languageCode: track.languageCode, kind: track.kind })),
    },
    window.location.origin,
  );
});
