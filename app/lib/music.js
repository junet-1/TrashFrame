import { fetchAppleMusicItem, isAppleMusicUrl } from "./appleMusic";
import { fetchSpotifyItem, isSpotifyUrl } from "./spotify";

export async function fetchMusicItem(url) {
  if (isAppleMusicUrl(url)) return fetchAppleMusicItem(url);
  if (isSpotifyUrl(url) || String(url || "").trim().startsWith("spotify:")) {
    return fetchSpotifyItem(url);
  }

  const err = new Error(
    "Paste a Spotify or Apple Music album or song link.",
  );
  err.code = "music_url_invalid";
  throw err;
}
