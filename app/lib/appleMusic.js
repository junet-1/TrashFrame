const APPLE_MUSIC_ID_RE = /^\d+$/;
const APPLE_MUSIC_HOST = "music.apple.com";
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const SUPPORTED_RESOURCE_TYPES = new Set(["album", "song"]);

const RESOURCE_LABELS = {
  album: "album",
  artist: "artist",
  musicVideo: "music video",
  playlist: "playlist",
  song: "song",
  station: "station",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function makeAppleMusicError(message, code = "apple_music_url_invalid") {
  const err = new Error(message);
  err.code = code;
  return err;
}

function normalizeInputUrl(value) {
  const input = String(value || "").trim();
  if (URL_SCHEME_RE.test(input)) return input;
  if (/^(?:www\.)?music\.apple\.com\//i.test(input)) return `https://${input}`;
  return input;
}

function isAppleMusicHost(hostname) {
  return hostname === APPLE_MUSIC_HOST || hostname.endsWith(`.${APPLE_MUSIC_HOST}`);
}

function resourceLabel(resourceType) {
  return RESOURCE_LABELS[resourceType] || resourceType || "item";
}

function validateId(id, resourceType) {
  if (!id || !APPLE_MUSIC_ID_RE.test(id)) {
    throw makeAppleMusicError(
      `That Apple Music ${resourceLabel(resourceType)} link looks incomplete. Copy the full link and try again.`,
      `apple_music_${resourceType || "item"}_link_incomplete`,
    );
  }
  return id;
}

export function isAppleMusicUrl(value) {
  try {
    const parsed = new URL(normalizeInputUrl(value));
    return isAppleMusicHost(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parseAppleMusicResource(value) {
  if (!String(value || "").trim()) {
    throw makeAppleMusicError(
      "Paste an Apple Music album or song URL to continue.",
      "apple_music_url_missing",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizeInputUrl(value));
  } catch {
    throw makeAppleMusicError(
      "That doesn't look like an Apple Music link. Paste an album or song URL.",
      "apple_music_url_invalid",
    );
  }

  if (!isAppleMusicHost(parsedUrl.hostname.toLowerCase())) {
    throw makeAppleMusicError(
      "That doesn't look like an Apple Music link. Paste an album or song URL.",
      "apple_music_host_invalid",
    );
  }

  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  const storefront = (parts[0] || "").toLowerCase();
  const pathType = parts[1] || "";
  const pathId = parts.at(-1) || "";
  const songId = parsedUrl.searchParams.get("i");

  if (!/^[a-z]{2}$/.test(storefront) || !pathType) {
    throw makeAppleMusicError(
      "That Apple Music link looks incomplete. Copy the full album or song link and try again.",
      "apple_music_link_incomplete",
    );
  }

  const resourceType = songId ? "song" : pathType;
  if (!SUPPORTED_RESOURCE_TYPES.has(resourceType)) {
    throw makeAppleMusicError(
      `That's an Apple Music ${resourceLabel(resourceType)} link. Paste an album or song link instead.`,
      `apple_music_${resourceType || "unsupported"}_link`,
    );
  }

  const resourceId = validateId(songId || pathId, resourceType);
  return {
    resourceType,
    resourceId,
    storefront,
    sourceUrl: parsedUrl.toString(),
  };
}

function formatReleaseDate(rawDate) {
  const normalized = String(rawDate || "").slice(0, 10);
  const parts = normalized.split("-");
  const year = parts[0] || "";
  const monthIdx = parts[1] ? Number.parseInt(parts[1], 10) - 1 : -1;
  const day = parts[2] ? Number.parseInt(parts[2], 10) : null;
  const monthName = monthIdx >= 0 ? MONTHS[monthIdx] : "";

  return {
    releaseDate: day
      ? `${year} / ${monthName} ${day}`
      : monthIdx >= 0 ? `${year} / ${monthName}` : year,
    releaseYear: year,
  };
}

function msToTime(ms) {
  const seconds = Math.floor((Number(ms) || 0) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function highResolutionArtwork(url, size = 2000) {
  if (!url) return "";
  return url
    .replace("{w}x{h}", `${size}x${size}`)
    .replace(/\/\d+x\d+(?:bb)?\.(jpg|png)(?:\?.*)?$/i, `/${size}x${size}bb.$1`);
}

function cleanAppleUrl(url, fallback) {
  try {
    const parsed = new URL(url || fallback);
    parsed.searchParams.delete("uo");
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function trackFromLookup(track, number) {
  return {
    number,
    name: track.trackName || "Untitled",
    artists: track.artistName || "",
    duration: msToTime(track.trackTimeMillis),
    discNumber: track.discNumber || 1,
    trackNumber: track.trackNumber || number,
    explicit: track.trackExplicitness === "explicit",
    isrc: track.isrc || "",
  };
}

function normalizeAlbum(payload, sourceUrl, resourceId) {
  const collection = payload.results.find((item) => item.wrapperType === "collection");
  const rawTracks = payload.results.filter(
    (item) => item.wrapperType === "track" && item.kind === "song",
  );

  if (!collection) {
    throw makeAppleMusicError(
      "Apple Music couldn't find that album in this storefront.",
      "apple_music_album_not_found",
    );
  }

  const tracks = rawTracks.map((track, index) => trackFromLookup(track, index + 1));
  const totalMs = rawTracks.reduce((sum, track) => sum + (track.trackTimeMillis || 0), 0);
  const { releaseDate, releaseYear } = formatReleaseDate(collection.releaseDate);
  const totalTracks = collection.trackCount || tracks.length;
  const albumUrl = cleanAppleUrl(collection.collectionViewUrl, sourceUrl);

  return {
    provider: "appleMusic",
    mediaType: "album",
    name: collection.collectionName || "Untitled Album",
    artists: collection.artistName || "",
    releaseDate,
    releaseYear,
    totalTracks,
    totalDuration: msToTime(totalMs),
    tracks,
    coverUrl: highResolutionArtwork(collection.artworkUrl100),
    url: albumUrl,
    uri: "",
    albumType: collection.collectionType?.toUpperCase() || "ALBUM",
    collectionName: collection.collectionName || "",
    collectionType: collection.collectionType?.toUpperCase() || "ALBUM",
    collectionTrackCount: totalTracks,
    genre: collection.primaryGenreName || "",
    copyright: collection.copyright || "",
    appleMusicId: String(collection.collectionId || resourceId),
  };
}

function normalizeSong(payload, sourceUrl, resourceId) {
  const song = payload.results.find(
    (item) => item.wrapperType === "track" && item.kind === "song",
  );

  if (!song) {
    throw makeAppleMusicError(
      "Apple Music couldn't find that song in this storefront.",
      "apple_music_song_not_found",
    );
  }

  const { releaseDate, releaseYear } = formatReleaseDate(song.releaseDate);
  const duration = msToTime(song.trackTimeMillis);
  const trackNumber = song.trackNumber || 1;
  const songUrl = cleanAppleUrl(song.trackViewUrl || song.collectionViewUrl, sourceUrl);

  return {
    provider: "appleMusic",
    mediaType: "track",
    name: song.trackName || "Untitled Song",
    artists: song.artistName || "",
    releaseDate,
    releaseYear,
    totalTracks: 1,
    totalDuration: duration,
    tracks: [trackFromLookup(song, trackNumber)],
    coverUrl: highResolutionArtwork(song.artworkUrl100),
    url: songUrl,
    uri: "",
    albumType: "TRACK",
    collectionName: song.collectionName || "",
    collectionType: "ALBUM",
    collectionTrackCount: song.trackCount || null,
    trackNumber,
    discNumber: song.discNumber || 1,
    explicit: song.trackExplicitness === "explicit",
    isrc: song.isrc || "",
    genre: song.primaryGenreName || "",
    appleMusicId: String(song.trackId || resourceId),
  };
}

export async function fetchAppleMusicItem(url) {
  const { resourceType, resourceId, storefront, sourceUrl } = parseAppleMusicResource(url);
  const params = new URLSearchParams({
    id: resourceId,
    type: resourceType,
    storefront,
  });

  let res;
  try {
    res = await fetch(`/api/apple-music/lookup?${params}`);
  } catch {
    throw makeAppleMusicError(
      "Couldn't reach Apple Music right now. Check your connection and try again.",
      "apple_music_request_failed",
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw makeAppleMusicError(
      err.error || "Apple Music couldn't load that item right now. Try again in a moment.",
      err.code || "apple_music_fetch_failed",
    );
  }

  const payload = await res.json();
  return resourceType === "song"
    ? normalizeSong(payload, sourceUrl, resourceId)
    : normalizeAlbum(payload, sourceUrl, resourceId);
}
