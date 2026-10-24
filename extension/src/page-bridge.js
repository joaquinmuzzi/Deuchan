// Runs in the page itself (world "MAIN"), because the player's data is not visible from the
// isolated world of a content script. It answers `deuchan:request` with the data of the video that
// is open, and never writes to the page.
window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.type !== "deuchan:request") {
    return;
  }
  const response = document.getElementById("movie_player")?.getPlayerResponse?.();
  const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  window.postMessage(
    {
      type: "deuchan:video",
      videoId: response?.videoDetails?.videoId ?? null,
      title: response?.videoDetails?.title ?? "",
      description: response?.videoDetails?.shortDescription ?? "",
      captionTracks: tracks.map((track) => ({ languageCode: track.languageCode, kind: track.kind })),
    },
    window.location.origin,
  );
});
