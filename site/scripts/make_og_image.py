#!/usr/bin/env python3
"""Generate every bitmap the brand is drawn into, from one lockup.

Run: `python3 scripts/make_og_image.py` from `site/`. It writes:

    site/public/og-image.png   1200×630, the link-preview card
    site/public/favicon.ico    16/32/48, the icon every surface can read
    site/public/icon-180.png   the iOS home screen
    site/public/icon-192.png   Android, and the manifest's small icon
    site/public/icon-512.png   the installed app, and the splash
    docs/img/banner.bg.png     1200×348, the masthead of README.bg.md
    docs/img/banner.en.png     1200×348, the masthead of README.md

Why this file exists. The wordmark is *drawn into the bitmap*, so a brand or
palette change cannot be a find-and-replace — the pixels have to be
re-rendered. Committing the generator alongside its output is what keeps the
next such change a re-run rather than an archaeology exercise.

Why all three come out of one script and one `lockup()`. The mark, the
wordmark and the strapline are the same object at the same geometry on every
surface; drawn twice they drift, and they drift in the two places a stranger
meets this project first. One function, three canvases.

Dependencies: none. `zlib` and `struct` from the standard library; PIL is
deliberately not used because it is not installed and this needs no more than
a bitmap font blitted onto a flat background.

What the card may carry (docs/principles.md P4 and the sharing section):
the wordmark, the strapline and the source line — and NO number. Preview
images are cached hard by every platform, so a stale inflation figure in a
cached card is our credibility, not theirs.

After changing anything here, LOOK AT THE RESULT before committing it. Every
glyph is hand-authored; a wrong bit is invisible to every test in this repo
and perfectly visible to everyone the link is sent to.
"""

import struct
import sys
import zlib
from pathlib import Path

# ---------------------------------------------------------------------------
# Palette — must track src/lib/tokens.css (light theme). The card does not
# adapt to the reader's theme: previews render on the platform's own surface.
# ---------------------------------------------------------------------------
PAPER = (0xEC, 0xEE, 0xE8)  # --paper
LINE_2 = (0xE0, 0xE4, 0xDA)  # --line-2, the faint ledger rules
INK = (0x17, 0x21, 0x1B)  # --ink, the wordmark
MUTED = (0x67, 0x6E, 0x64)  # --muted (the AA-compliant value)
REAL = (0x1C, 0x6B, 0x54)  # --real, the "now" bar and the underline
ERODE = (0xB2, 0x3A, 0x2E)  # --erode, the call to action

W, H = 1200, 630
BANNER_W, BANNER_H = 1200, 348

# ---------------------------------------------------------------------------
# A 5×7 bitmap font.
#
# Bulgarian uppercase in full (А–Я, no Ы/Э/Ё — they are not Bulgarian letters),
# Latin A–Z, digits and the punctuation the card uses. Rendering an unknown
# character RAISES rather than skipping it: a silently dropped glyph would ship
# a wordmark with a hole in it, and nothing downstream would notice.
# ---------------------------------------------------------------------------
FONT = {
    # -- Cyrillic ----------------------------------------------------------
    "А": ".###.|#...#|#...#|#####|#...#|#...#|#...#",
    "Б": "#####|#....|#....|####.|#...#|#...#|####.",
    "В": "####.|#...#|#...#|####.|#...#|#...#|####.",
    "Г": "#####|#....|#....|#....|#....|#....|#....",
    "Д": ".####|.#..#|.#..#|.#..#|.#..#|#####|#...#",
    "Е": "#####|#....|#....|####.|#....|#....|#####",
    "Ж": "#.#.#|#.#.#|#.#.#|.###.|#.#.#|#.#.#|#.#.#",
    "З": "####.|#...#|....#|..##.|....#|#...#|####.",
    "И": "#...#|#...#|#..##|#.#.#|##..#|#...#|#...#",
    "Й": ".#.#.|#...#|#..##|#.#.#|##..#|#...#|#...#",
    "К": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
    "Л": "..###|.#..#|.#..#|.#..#|.#..#|.#..#|#...#",
    "М": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
    "Н": "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    "О": ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    "П": "#####|#...#|#...#|#...#|#...#|#...#|#...#",
    "Р": "####.|#...#|#...#|####.|#....|#....|#....",
    "С": ".###.|#...#|#....|#....|#....|#...#|.###.",
    "Т": "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    "У": "#...#|#...#|#...#|.####|....#|#...#|.###.",
    "Ф": "..#..|.###.|#.#.#|#.#.#|#.#.#|.###.|..#..",
    "Х": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Ц": "#..#.|#..#.|#..#.|#..#.|#..#.|#####|....#",
    "Ч": "#...#|#...#|#...#|.####|....#|....#|....#",
    "Ш": "#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#####",
    "Щ": "#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#####|....#",
    "Ъ": "##...|.#...|.#...|.###.|.#..#|.#..#|.###.",
    "Ь": "#....|#....|#....|####.|#...#|#...#|####.",
    "Ю": "#.##.|#.#.#|#.#.#|###.#|#.#.#|#.#.#|#.##.",
    "Я": ".####|#...#|#...#|.####|..#.#|.#..#|#...#",
    # -- Latin -------------------------------------------------------------
    "A": ".###.|#...#|#...#|#####|#...#|#...#|#...#",
    "B": "####.|#...#|#...#|####.|#...#|#...#|####.",
    "C": ".###.|#...#|#....|#....|#....|#...#|.###.",
    "D": "###..|#..#.|#...#|#...#|#...#|#..#.|###..",
    "E": "#####|#....|#....|####.|#....|#....|#####",
    "F": "#####|#....|#....|####.|#....|#....|#....",
    "G": ".###.|#...#|#....|#.###|#...#|#...#|.###.",
    "H": "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    "I": "#####|..#..|..#..|..#..|..#..|..#..|#####",
    "J": "....#|....#|....#|....#|#...#|#...#|.###.",
    "K": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
    "L": "#....|#....|#....|#....|#....|#....|#####",
    "M": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
    "N": "#...#|##..#|##..#|#.#.#|#..##|#..##|#...#",
    "O": ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    "P": "####.|#...#|#...#|####.|#....|#....|#....",
    "Q": ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
    "R": "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    "S": ".####|#....|#....|.###.|....#|....#|####.",
    "T": "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    "U": "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
    "V": "#...#|#...#|#...#|#...#|.#.#.|.#.#.|..#..",
    "W": "#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#",
    "X": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Y": "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
    "Z": "#####|....#|...#.|..#..|.#...|#....|#####",
    # -- digits ------------------------------------------------------------
    "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
    "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
    "2": ".###.|#...#|....#|...#.|..#..|.#...|#####",
    "3": "#####|...#.|..#..|...#.|....#|#...#|.###.",
    "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
    "5": "#####|#....|####.|....#|....#|#...#|.###.",
    "6": "..##.|.#...|#....|####.|#...#|#...#|.###.",
    "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
    "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
    "9": ".###.|#...#|#...#|.####|....#|...#.|.##..",
    # -- punctuation and space --------------------------------------------
    " ": ".....|.....|.....|.....|.....|.....|.....",
    ".": ".....|.....|.....|.....|.....|.##..|.##..",
    ",": ".....|.....|.....|.....|.##..|.##..|.#...",
    "·": ".....|.....|..##.|..##.|.....|.....|.....",
    "-": ".....|.....|.....|#####|.....|.....|.....",
    "/": "....#|...#.|...#.|..#..|.#...|.#...|#....",
    "!": "..#..|..#..|..#..|..#..|..#..|.....|..#..",
    "?": ".###.|#...#|....#|..##.|..#..|.....|..#..",
    "%": "##..#|##..#|...#.|..#..|.#...|#..##|#..##",
}

GLYPH_W, GLYPH_H = 5, 7


class Canvas:
    """A flat RGB pixel buffer that knows how to write itself out as a PNG."""

    def __init__(self, width, height, background):
        self.w, self.h = width, height
        self.px = bytearray(bytes(background) * width * height)

    def rect(self, x, y, w, h, colour):
        r, g, b = colour
        for yy in range(max(0, y), min(self.h, y + h)):
            row = yy * self.w
            for xx in range(max(0, x), min(self.w, x + w)):
                i = (row + xx) * 3
                self.px[i] = r
                self.px[i + 1] = g
                self.px[i + 2] = b

    def text(self, s, x, y, scale, colour, tracking=None):
        """Blit `s` at (x, y), each font pixel drawn as a scale×scale block.

        Returns the x coordinate just past the last glyph, so callers can
        measure a line before committing to a layout.
        """
        gap = scale if tracking is None else tracking
        advance = GLYPH_W * scale + gap
        for i, ch in enumerate(s):
            glyph = FONT.get(ch)
            if glyph is None:
                raise KeyError(
                    f"no glyph for {ch!r} (U+{ord(ch):04X}) in the 5x7 font. "
                    f"Add it to FONT — do not let the card render a hole."
                )
            gx = x + i * advance
            for ry, rowbits in enumerate(glyph.split("|")):
                for rx, bit in enumerate(rowbits):
                    if bit == "#":
                        self.rect(gx + rx * scale, y + ry * scale, scale, scale, colour)
        return x + len(s) * advance - gap

    def width_of(self, s, scale, tracking=None):
        gap = scale if tracking is None else tracking
        return len(s) * (GLYPH_W * scale + gap) - gap

    def to_png(self):
        raw = bytearray()
        stride = self.w * 3
        for y in range(self.h):
            raw.append(0)  # filter type 0 (None) — the image is flat colour
            raw += self.px[y * stride : (y + 1) * stride]

        def chunk(tag, data):
            return (
                struct.pack(">I", len(data))
                + tag
                + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
            )

        ihdr = struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0)
        return (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b"")
        )


# ---------------------------------------------------------------------------
# The lockup, and the one rule about it.
#
# **The brand is «ВЯРНО». The domain is vyarno.bg. They are two strings and
# they never fuse.** «ВЯРНО.BG» is neither: read as a name it has a TLD stuck
# on it, and read as an address it is a Cyrillic IDN nobody here registered —
# so a reader who types what the card shows arrives nowhere. `legal.js`
# publishes the correct pairing as the ЗЕТ чл. 4 т. 1 identity row, «Вярно ·
# vyarno.bg», and this file follows it: the name is the wordmark, the address
# sits apart in Latin.
#
# The lockup itself mirrors the in-app header — mark, wordmark, strapline —
# because the tab icon, the page, the share card and the README masthead are
# one identity and a mark that drifts between them looks hand-made.
# ---------------------------------------------------------------------------
WORDMARK = "ВЯРНО"
DOMAIN = "VYARNO.BG"  # upper-case for the 5×7 font; hostnames are case-blind
STRAPLINE = "ИКОНОМИКАТА, ЧЕСТНО"  # = COPY.brandSmall.bg, upper-cased
STRAPLINE_EN = "THE ECONOMY, HONESTLY"  # = COPY.brandSmall.en, upper-cased
HEADLINE = "СМЕТНИ СВОЯТА ИНФЛАЦИЯ"
SOURCE = "ОТ ОФИЦИАЛНИТЕ ДАННИ НА ЕВРОСТАТ"

MARGIN = 96
RIGHT = W - MARGIN

# Wordmark size. 12 is the ceiling for this font, not a taste: a 5×7 glyph
# blown up past it stops reading as a letter and starts reading as a grid of
# squares, and «Я» — a bowl and a diagonal leg inside five columns — is the
# one that goes first.
#
# **Tracking stays at the default, which is one glyph cell.** Every glyph here
# fills its 5-wide box edge to edge, so a gap under `scale` runs the letters
# together and the wordmark comes out as one continuous shape.
WM_SCALE = 12

# The strapline and the domain are one rank below the wordmark and the same
# rank as each other — a descriptor and an address, neither more important
# than the other — so they share a size and a colour. Set larger, the
# strapline outruns the wordmark it describes.
SUB_SCALE = 4


def lockup(c, top, strapline):
    """Mark, wordmark and strapline, with the domain set against the margin.

    `top` is the rule the block hangs from; everything below is measured from
    it, so the card and the banner cannot disagree about the geometry.
    """
    # "Then" (short, muted) against "now" (tall, green), with a dashed
    # baseline between them — the same three shapes as favicon.svg and the
    # in-app SVG in SiteHeader.svelte, at 8× their size.
    base = top + 171
    c.rect(MARGIN, base - 88, 26, 88, MUTED)
    c.rect(204, base - 158, 26, 158, REAL)
    for dx in range(128, 200, 12):
        c.rect(dx, base - 8, 7, 4, REAL)

    # The wordmark sits on the same baseline as the mark's two bars.
    c.text(WORDMARK, 260, base - GLYPH_H * WM_SCALE, WM_SCALE, INK)

    # The address, ranged right on the wordmark's own line. It balances a
    # composition that is otherwise all in the left third, and it is the one
    # thing on the artwork a reader might retype.
    c.text(
        DOMAIN,
        RIGHT - c.width_of(DOMAIN, SUB_SCALE),
        base - GLYPH_H * SUB_SCALE,
        SUB_SCALE,
        MUTED,
    )

    c.text(strapline, 264, top + 190, SUB_SCALE, MUTED)


# ---------------------------------------------------------------------------
# The app icon — the mark alone, no wordmark, at the sizes surfaces ask for.
#
# `public/favicon.svg` is this same geometry in vector form and serves the tab.
# These exist because a great many surfaces cannot read one: Chrome paints the
# default globe in its history, its restore-tabs card and its new-tab tiles for
# a site that ships SVG only, and iOS crops `apple-touch-icon` to a square, so a
# 1200×630 banner in that slot arrives as a slice of its own middle.
#
# Geometry is favicon.svg's 22-unit box, scaled. Below 48px the dashed baseline
# is a smear rather than a rule, so it is dropped and the two bars carry the
# mark — one drawing with a stated threshold, never two artworks that drift.
# Square, because every platform that wants a rounded icon applies its own mask.
# ---------------------------------------------------------------------------
ICON_UNITS = 22


def build_icon(size):
    at = lambda v: round(v * size / ICON_UNITS)  # noqa: E731
    c = Canvas(size, size, PAPER)
    c.rect(at(3), at(7), max(1, at(4)), max(1, at(12)), MUTED)
    c.rect(at(15), at(3), max(1, at(4)), max(1, at(16)), REAL)
    if size >= 48:
        # Centred on the bar feet, the way a stroke is: drawn from y=19 down it
        # sits a whole stroke below them and reads as two stray blocks rather
        # than as the rule that joins "then" to "now".
        for x in range(at(7), at(15), at(4)):
            c.rect(x, at(19 - 0.7), at(2), max(1, at(1.4)), REAL)
    return c


def ico(sizes):
    """An ICO container around PNG payloads, which every reader of one accepts."""
    blobs = [(s, build_icon(s).to_png()) for s in sizes]
    head = struct.pack("<HHH", 0, 1, len(blobs))
    offset = len(head) + 16 * len(blobs)
    entries = b""
    for size, blob in blobs:
        entries += struct.pack("<BBBBHHII", size, size, 0, 0, 1, 24, len(blob), offset)
        offset += len(blob)
    return head + entries + b"".join(b for _, b in blobs)


def build_card():
    """The 1200×630 link preview."""
    c = Canvas(W, H, PAPER)
    for y in (155, 325, 410, 500, 590):
        c.rect(MARGIN, y, W - 2 * MARGIN, 1, LINE_2)

    lockup(c, 155, STRAPLINE)

    c.text(HEADLINE, MARGIN, 448, 7, ERODE)
    c.text(SOURCE, MARGIN, 516, SUB_SCALE, MUTED)
    c.rect(MARGIN, 568, 220, 3, REAL)
    return c


def build_banner(strapline):
    """The 1200×348 README masthead: the lockup between two rules, nothing else.

    No headline and no call to action. A README is already the pitch, and a
    banner that repeats it in pixels is an advert at the top of a repository.
    """
    c = Canvas(BANNER_W, BANNER_H, PAPER)
    for y in (48, 300):
        c.rect(MARGIN, y, BANNER_W - 2 * MARGIN, 1, LINE_2)
    lockup(c, 48, strapline)
    return c


def main():
    site = Path(__file__).resolve().parents[1]
    root = site.parent

    # Prove the font covers every string before drawing anything: a missing
    # glyph must be an error at the top, not a hole discovered by whoever the
    # link is sent to.
    strings = (WORDMARK, DOMAIN, STRAPLINE, STRAPLINE_EN, HEADLINE, SOURCE)
    missing = sorted({ch for s in strings for ch in s if ch not in FONT})
    if missing:
        sys.exit(f"missing glyphs: {missing}")

    card = build_card()
    if card.width_of(HEADLINE, 7) > W - 2 * MARGIN:
        sys.exit("the headline overflows the card's margins")

    # The wordmark and the domain share a baseline and are set from opposite
    # margins, so a longer name or a longer host is what closes the gap
    # between them. 40px is the narrowest that still reads as two elements.
    gap = (RIGHT - card.width_of(DOMAIN, SUB_SCALE)) - (260 + card.width_of(WORDMARK, WM_SCALE))
    if gap < 40:
        sys.exit(f"the wordmark and the domain are {gap}px apart on the same line")
    for strapline in (STRAPLINE, STRAPLINE_EN):
        if 264 + card.width_of(strapline, SUB_SCALE) > RIGHT:
            sys.exit(f"the strapline overflows the right margin: {strapline}")

    targets = [
        (site / "public" / "og-image.png", card),
        (site / "public" / "icon-180.png", build_icon(180)),
        (site / "public" / "icon-192.png", build_icon(192)),
        (site / "public" / "icon-512.png", build_icon(512)),
        (root / "docs" / "img" / "banner.bg.png", build_banner(STRAPLINE)),
        (root / "docs" / "img" / "banner.en.png", build_banner(STRAPLINE_EN)),
    ]
    favicon = site / "public" / "favicon.ico"
    favicon.write_bytes(ico((16, 32, 48)))
    print(f"wrote {favicon.relative_to(root)} ({favicon.stat().st_size} bytes, 16/32/48)")
    for out, canvas in targets:
        out.write_bytes(canvas.to_png())
        print(f"wrote {out.relative_to(root)} ({out.stat().st_size} bytes, {canvas.w}×{canvas.h})")
    print(f"  wordmark  {WORDMARK}  ({card.width_of(WORDMARK, WM_SCALE)} px wide)")
    print(f"  domain    {DOMAIN}  ({card.width_of(DOMAIN, SUB_SCALE)} px wide)")


if __name__ == "__main__":
    main()
