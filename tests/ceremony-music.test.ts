import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLAYLIST_VOLUME,
  hasCeremonyPlaylist,
  isEmbeddablePlaylistId,
} from "@/config/ceremony-music";
import { pickTrackIndex, toPlayerVolume } from "@/lib/stars/playlist";

/*
 * The music under the ceremony.
 *
 * Most of `lib/stars/playlist.ts` is browser glue — a script tag, an iframe,
 * an object YouTube puts on `window` — and glue is verified by opening the
 * page. What is pinned here is everything that can be wrong *without* being
 * visible: which song gets picked, which playlist ids can never work, and the
 * volume the song arrives at.
 */

describe("choosing a song", () => {
  it("picks the only song in a playlist of one", () => {
    expect(pickTrackIndex(1, 0)).toBe(0);
    expect(pickTrackIndex(1, 0.999)).toBe(0);
  });

  it("splits the range evenly between the songs", () => {
    expect(pickTrackIndex(4, 0)).toBe(0);
    expect(pickTrackIndex(4, 0.24)).toBe(0);
    expect(pickTrackIndex(4, 0.25)).toBe(1);
    expect(pickTrackIndex(4, 0.99)).toBe(3);
  });

  it("never asks YouTube for a song that is not there", () => {
    // `Math.random()` is documented as below 1; a picker that can run off the
    // end of the playlist should not depend on that.
    expect(pickTrackIndex(30, 1)).toBe(29);
    expect(pickTrackIndex(30, -0.5)).toBe(0);
  });

  it("says there is nothing to play for an empty playlist", () => {
    // Which is how a playlist that loaded but turned out to be empty ends up
    // playing the fanfare instead of throwing.
    expect(pickTrackIndex(0, 0.5)).toBe(-1);
  });

  it("reaches every song over enough ceremonies", () => {
    /*
     * The point of the feature: a different song each Sunday. A picker with an
     * off-by-one would quietly never play the first or the last track, and
     * nobody would notice for months.
     */
    const seen = new Set<number>();
    for (let i = 0; i < 20_000; i += 1) {
      seen.add(pickTrackIndex(12, Math.random()));
    }
    expect(seen.size).toBe(12);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(11);
  });
});

describe("the volume", () => {
  it("converts this app's 0-1 to YouTube's 0-100", () => {
    expect(toPlayerVolume(0)).toBe(0);
    expect(toPlayerVolume(1)).toBe(100);
    expect(toPlayerVolume(PLAYLIST_VOLUME)).toBe(28);
  });

  it("clamps rather than handing YouTube something out of range", () => {
    expect(toPlayerVolume(-1)).toBe(0);
    expect(toPlayerVolume(4)).toBe(100);
  });

  it("is quieter than the fanfare", () => {
    /*
     * The fanfare is thin and brassy and was written to sit under a voice; a
     * real record is mastered to be the thing you are listening to. At the
     * same number the song buries whoever is reading a child's name out.
     */
    expect(PLAYLIST_VOLUME).toBeLessThan(0.42);
  });
});

describe("which playlists can work at all", () => {
  it("accepts an ordinary playlist id", () => {
    expect(isEmbeddablePlaylistId("PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb")).toBe(true);
    expect(isEmbeddablePlaylistId("OLAK5uy_kZ1a2b3c4d5e6f7g8h9i0jKlMnOpQrSt")).toBe(true);
  });

  it("rejects a whole URL, which is the easy mistake", () => {
    // Pasting the address bar rather than the `list=` parameter out of it.
    expect(
      isEmbeddablePlaylistId("https://music.youtube.com/playlist?list=PL123"),
    ).toBe(false);
    expect(isEmbeddablePlaylistId("PL123&si=abc")).toBe(false);
  });

  it("rejects the playlists that belong to an account rather than a URL", () => {
    /*
     * Liked Music and the radio/mix playlists cannot be embedded whatever
     * their privacy is set to, and the failure otherwise arrives as a silent
     * fallback to the fanfare that looks like a bug in this app.
     */
    expect(isEmbeddablePlaylistId("LM")).toBe(false);
    expect(isEmbeddablePlaylistId("RDCLAK5uy_kLWIr9gv1XLlPbaDS965-Db4TrBoUTxQ8")).toBe(false);
    expect(isEmbeddablePlaylistId("RDMM")).toBe(false);
  });

  it("treats blank and whitespace as no playlist", () => {
    expect(isEmbeddablePlaylistId("")).toBe(false);
    expect(isEmbeddablePlaylistId("   ")).toBe(false);
  });
});

describe("shipping without a playlist", () => {
  /*
   * The whole feature is safe to ship un-configured, and that is deliberate
   * rather than incidental: an empty id is a supported state in which the
   * ceremony plays exactly the fanfare it played before any of this existed.
   */
  it("says so when nothing is configured", async () => {
    const { CEREMONY_PLAYLIST_ID } = await import("@/config/ceremony-music");
    if (CEREMONY_PLAYLIST_ID === "") {
      expect(hasCeremonyPlaylist()).toBe(false);
    } else {
      // Once a real playlist is pasted in, it must be one that can be embedded
      // — this is the test that catches a URL or a Liked Music id at build
      // time rather than on a Sunday afternoon.
      expect(hasCeremonyPlaylist()).toBe(true);
      expect(isEmbeddablePlaylistId(CEREMONY_PLAYLIST_ID)).toBe(true);
    }
  });
});

describe("starting it", () => {
  /*
   * The config is mocked per test rather than read, so these hold whatever is
   * actually configured today — the invariant is "an unset playlist costs
   * nothing and a broken one falls back", not "the Birch playlist is empty".
   */
  async function withPlaylist(id: string, timeoutMs = 20) {
    vi.doMock("@/config/ceremony-music", async () => {
      const actual = await vi.importActual<
        typeof import("@/config/ceremony-music")
      >("@/config/ceremony-music");
      return {
        ...actual,
        CEREMONY_PLAYLIST_ID: id,
        PLAYLIST_TIMEOUT_MS: timeoutMs,
        // Overridden too: the real one closes over the real constant, so
        // spreading `actual` alone would leave it answering about the wrong
        // playlist.
        hasCeremonyPlaylist: () => id.trim().length > 0,
      };
    });
    return import("@/lib/stars/playlist");
  }

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/config/ceremony-music");
    vi.unstubAllGlobals();
  });

  it("declines, without touching the network, when no playlist is set", async () => {
    /*
     * An app that phones a third party on every ceremony whether or not it
     * needs to is one that stops working offline for no reason. With nothing
     * configured, YouTube's script must never be fetched at all.
     */
    const append = vi.spyOn(document.head, "append");
    const { startCeremonyPlaylist, primeCeremonyPlaylist } =
      await withPlaylist("");

    primeCeremonyPlaylist();
    await expect(startCeremonyPlaylist(0.3)).resolves.toBe(false);
    expect(append).not.toHaveBeenCalled();
    append.mockRestore();
  });

  it("declines without touching the network for an un-embeddable id", async () => {
    // Liked Music can never be embedded, so there is nothing to wait for.
    const append = vi.spyOn(document.head, "append");
    const { startCeremonyPlaylist } = await withPlaylist("LM");

    await expect(startCeremonyPlaylist(0.3)).resolves.toBe(false);
    expect(append).not.toHaveBeenCalled();
    append.mockRestore();
  });

  it("gives up rather than hanging when YouTube never arrives", async () => {
    /*
     * The guarantee the whole fallback rests on. Offline, blocked by an
     * extension, or simply slow — it has to *answer*, because the ceremony is
     * waiting on that answer to decide whether to play the fanfare instead. A
     * promise that never settles is a silent Sunday afternoon.
     */
    const { startCeremonyPlaylist } = await withPlaylist("PLtest123");

    await expect(startCeremonyPlaylist(0.3)).resolves.toBe(false);
  });

  it("asks for YouTube exactly once, however many times it is primed", async () => {
    const { primeCeremonyPlaylist } = await withPlaylist("PLtest123");

    primeCeremonyPlaylist();
    primeCeremonyPlaylist();
    primeCeremonyPlaylist();

    expect(
      document.querySelectorAll('script[src*="youtube.com/iframe_api"]'),
    ).toHaveLength(1);
  });

  it("stops safely when nothing was ever playing", async () => {
    const { stopCeremonyPlaylist } = await withPlaylist("PLtest123");
    expect(() => stopCeremonyPlaylist()).not.toThrow();
  });
});
