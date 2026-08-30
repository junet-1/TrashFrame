import { NextResponse } from "next/server";

const VALID_ID = /^\d+$/;
const VALID_STOREFRONT = /^[a-z]{2}$/;
const VALID_TYPES = new Set(["album", "song"]);

function jsonError(error, status, code, details) {
  return NextResponse.json({ error, code, details }, { status });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const type = searchParams.get("type") || "";
  const storefront = (searchParams.get("storefront") || "").toLowerCase();

  if (!VALID_ID.test(id) || !VALID_TYPES.has(type) || !VALID_STOREFRONT.test(storefront)) {
    return jsonError(
      "Invalid Apple Music lookup request.",
      400,
      "apple_music_bad_request",
    );
  }

  const params = new URLSearchParams({
    id,
    country: storefront,
    entity: "song",
    limit: type === "album" ? "300" : "1",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`https://itunes.apple.com/lookup?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (res.status === 429) {
      return jsonError(
        "Apple Music is rate limiting requests right now. Try again in a minute.",
        429,
        "apple_music_rate_limited",
      );
    }

    if (!res.ok) {
      const details = await res.text();
      return jsonError(
        "Apple Music returned an unexpected lookup error.",
        502,
        "apple_music_api_error",
        details,
      );
    }

    const payload = await res.json();
    if (!payload.resultCount) {
      return jsonError(
        `Apple Music couldn't find that ${type} in the ${storefront.toUpperCase()} storefront.`,
        404,
        `apple_music_${type}_not_found`,
      );
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return jsonError("Apple Music request timed out.", 504, "apple_music_timeout");
    }
    return jsonError(
      "Something went wrong while loading that Apple Music item.",
      500,
      "internal_error",
      err.message,
    );
  } finally {
    clearTimeout(timeout);
  }
}
