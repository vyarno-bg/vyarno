#!/usr/bin/env python3
"""Generate every bitmap the brand is drawn into, from one lockup.

Run: `python3 scripts/make_og_image.py` from `site/`. It writes:

    site/public/og-*.png       1200×630, one link-preview card per page per
                               language — see CARDS
    site/public/favicon.ico    16/32/48, the icon every surface can read
    site/public/icon-180.png   the iOS home screen
    site/public/icon-192.png   Android, and the manifest's small icon
    site/public/icon-512.png   the installed app, and the splash
    docs/img/banner.bg.png     1200×348, the masthead of README.bg.md
    docs/img/banner.en.png     1200×348, the masthead of README.md
    docs/img/facebook-cover.png  1640×624, the cover of the Facebook page

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
# --muted. The old 0x676E64 sat at exactly 4.50:1 on PAPER — the floor, which
# tokens.css says no small text should sit ON; the token itself was retuned to
# 5.47:1 and this file had kept the pre-retune value.
MUTED = (0x5A, 0x61, 0x57)
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

# ---------------------------------------------------------------------------
# The cards: file, strapline, headline, and what the page reads.
#
# **A page unfurls as itself or it does not unfurl at all.** Facebook, Viber,
# Telegram and Slack draw a picture only where `og:image` resolves, and nothing
# on this site can stand in for one — every entry's body is a mount point and a
# `<noscript>`, the mark is inline SVG, and no served page carries a single
# `<img>` for a scraper to fall back on. A page declaring no card is a one-line
# row in a chat window, under a title a recipient reads once.
#
# Reusing one card across the pages is the other wrong answer, and the entries
# argue it where somebody would do it: a strapline about working out your own
# inflation, over a page of national housing figures, unfurls a reference page
# as a calculator.
#
# **A language is a card, not a string swap.** The artwork is pixels, so the
# Bulgarian card under an English title is not a page half-translated — it is
# Cyrillic sent to somebody who cannot read it, beside a title that can be.
#
# **NO FIGURE ON ANY OF THEM.** Every platform caches a preview hard and
# re-fetches it on its own schedule, so a rate drawn here is still being served
# months after the payload moved — our credibility rather than the publisher's
# (docs/principles.md P4). The headline says what the page ANSWERS; the answer
# itself is on the page, where a refresh reaches it.
#
# `/legal/` and `/support/` have no card and declare no `og:image`. Both
# entries carry that reasoning at the point somebody would add one.
#
# The source line names the publishers rather than repeating the strapline,
# because it is the claim that separates this from an opinion blog and it is
# what P9 asks a surface carrying no link to carry.
# ---------------------------------------------------------------------------
CARDS = (
    (
        "og-image.png",
        STRAPLINE,
        "СМЕТНИ СВОЯТА ИНФЛАЦИЯ",
        "ОТ ОФИЦИАЛНИТЕ ДАННИ НА ЕВРОСТАТ",
    ),
    # «Своята» is reflexive and carries «your own» in one word; English has no
    # such word, so the card drops "own" rather than overflowing the margin.
    # The og:title above it keeps the full «work out your own inflation».
    (
        "og-image.en.png",
        STRAPLINE_EN,
        "WORK OUT YOUR INFLATION",
        "FROM OFFICIAL EUROSTAT DATA",
    ),
    (
        "og-how.png",
        STRAPLINE,
        "ЧИСЛАТА ЗА БЪЛГАРИЯ",
        "ЕВРОСТАТ, ЕЦБ, НСИ, БНБ, ИМОТ.BG",
    ),
    (
        "og-how.en.png",
        STRAPLINE_EN,
        "THE FIGURES FOR BULGARIA",
        "EUROSTAT, ECB, NSI, BNB, IMOT.BG",
    ),
    (
        "og-market.png",
        STRAPLINE,
        "ПАЗАРЪТ НА ЖИЛИЩА",
        "ЕВРОСТАТ, НСИ И ОБЯВИТЕ НА ИМОТ.BG",
    ),
    (
        "og-market.en.png",
        STRAPLINE_EN,
        "THE PROPERTY MARKET",
        "EUROSTAT, NSI AND IMOT.BG LISTINGS",
    ),
    # «Кредитите» rather than «жилищните кредити»: the card is a title, the
    # glyph grid gives it one line, and the page covers what a home loan costs
    # AND who is actually taking one out.
    (
        "og-credit.png",
        STRAPLINE,
        "КРЕДИТИТЕ В БЪЛГАРИЯ",
        "БНБ И ЕЦБ",
    ),
    (
        "og-credit.en.png",
        STRAPLINE_EN,
        "BORROWING IN BULGARIA",
        "BNB AND THE ECB",
    ),
)

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

# The headline, one rank under the wordmark and one above the strapline. It is
# the only line on the card set in ERODE, so the size is what stops a reader
# taking the wordmark for the message. At this scale a line fits 24 glyphs;
# `main()` exits non-zero rather than letting a longer one run off the margin.
HEAD_SCALE = 7


def lockup(c, top, strapline, left=MARGIN, right=RIGHT):
    """Mark, wordmark and strapline, with the domain set against the margin.

    `top` is the rule the block hangs from; everything below is measured from
    it, so the card and the banner cannot disagree about the geometry. `left`
    and `right` shift the whole block as one — the cover is wider than the card
    and insets further, and a block re-laid out per canvas is a second lockup.
    """
    dx = left - MARGIN
    # "Then" (short, muted) against "now" (tall, green), joined by one
    # unbroken rule — the same three shapes as favicon.svg and the in-app SVG
    # in SiteHeader.svelte, at 8× their size. Solid rather than dashed because
    # the Facebook profile picture draws it solid and we cannot re-render that
    # copy; a mark differing between the two is what somebody spots first.
    base = top + 171
    c.rect(left, base - 88, 26, 88, MUTED)
    c.rect(204 + dx, base - 158, 26, 158, REAL)
    c.rect(122 + dx, base - 9, 82, 9, REAL)

    # The wordmark sits on the same baseline as the mark's two bars.
    c.text(WORDMARK, 260 + dx, base - GLYPH_H * WM_SCALE, WM_SCALE, INK)

    # The address, ranged right on the wordmark's own line. It balances a
    # composition that is otherwise all in the left third, and it is the one
    # thing on the artwork a reader might retype.
    c.text(
        DOMAIN,
        right - c.width_of(DOMAIN, SUB_SCALE),
        base - GLYPH_H * SUB_SCALE,
        SUB_SCALE,
        MUTED,
    )

    c.text(strapline, 264 + dx, top + 190, SUB_SCALE, MUTED)


# ---------------------------------------------------------------------------
# The app icon — the mark alone, no wordmark, at the sizes surfaces ask for.
#
# `public/favicon.svg` is this same geometry in vector form and serves the tab.
# These exist because a great many surfaces cannot read one: Chrome paints the
# default globe in its history, its restore-tabs card and its new-tab tiles for
# a site that ships SVG only, and iOS crops `apple-touch-icon` to a square, so a
# 1200×630 banner in that slot arrives as a slice of its own middle.
#
# Geometry is favicon.svg's 22-unit box, scaled, at every size the mark is
# whole: an unbroken rule still reads as a rule when it is one pixel tall, so
# no size drops it and there is one drawing here rather than two that drift.
# Square, because every platform that wants a rounded icon applies its own mask.
# ---------------------------------------------------------------------------
ICON_UNITS = 22


def build_icon(size):
    at = lambda v: round(v * size / ICON_UNITS)  # noqa: E731
    c = Canvas(size, size, PAPER)
    c.rect(at(3), at(7), max(1, at(4)), max(1, at(12)), MUTED)
    c.rect(at(15), at(3), max(1, at(4)), max(1, at(16)), REAL)
    # Its foot level with the bars': hung below them it reads as a block under
    # the mark rather than as the ground "then" and "now" both stand on.
    c.rect(at(7), at(19 - 1.4), at(15) - at(7), max(1, at(1.4)), REAL)
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


def build_card(strapline, headline, source):
    """One 1200×630 link preview: the shared lockup, this page's two lines."""
    c = Canvas(W, H, PAPER)
    for y in (155, 325, 410, 500, 590):
        c.rect(MARGIN, y, W - 2 * MARGIN, 1, LINE_2)

    lockup(c, 155, strapline)

    c.text(headline, MARGIN, 448, HEAD_SCALE, ERODE)
    c.text(source, MARGIN, 516, SUB_SCALE, MUTED)
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


# ---------------------------------------------------------------------------
# The Facebook cover.
#
# 1640×624 is what Facebook asks to be given; what it SHOWS is smaller and
# differs per device, and that is the whole of the layout below. Two crops eat
# the artwork and neither is opt-out: the sides go on a phone, so anything that
# has to be read lives inside COVER_SAFE, and the profile picture is pasted
# over the bottom-left corner on a desktop, so the block under the rule is
# centred rather than ranged left the way the card's is.
#
# It carries no figure, for the reason CARDS gives — a cover is cached by
# Facebook and by everyone who screenshots it, and it is changed by hand.
# ---------------------------------------------------------------------------
COVER_W, COVER_H = 1640, 624
COVER_MARGIN = 180  # = the safe band's left edge, so the lockup starts on it
COVER_SAFE = (COVER_MARGIN, COVER_W - COVER_MARGIN)

# The six subjects, in the order the header lists them. It is the one line on
# the cover that says the site is more than an inflation calculator, and the
# nearest thing to a menu a picture can carry.
COVER_NAV = "ИНФЛАЦИЯ · ЗАПЛАТИ · ДАНЪЦИ · НАЕМ · ИМОТИ · КРЕДИТИ"
COVER_HEAD = "СМЕТНИ СВОИТЕ ЧИСЛА"
COVER_SOURCE = "ЕВРОСТАТ, ЕЦБ, НСИ, БНБ, ИМОТ.BG"


def build_cover():
    """The 1640×624 Facebook cover: the shared lockup, then a centred block."""
    c = Canvas(COVER_W, COVER_H, PAPER)
    left, right = COVER_SAFE
    c.rect(left, 300, right - left, 1, LINE_2)

    lockup(c, 44, STRAPLINE, left=left, right=right)

    centred = lambda s, scale: (COVER_W - c.width_of(s, scale)) // 2  # noqa: E731
    c.text(COVER_NAV, centred(COVER_NAV, SUB_SCALE), 336, SUB_SCALE, MUTED)
    c.text(COVER_HEAD, centred(COVER_HEAD, HEAD_SCALE), 412, HEAD_SCALE, ERODE)
    c.text(COVER_SOURCE, centred(COVER_SOURCE, SUB_SCALE), 486, SUB_SCALE, MUTED)
    c.rect((COVER_W - 260) // 2, 548, 260, 4, REAL)
    return c


def main():
    site = Path(__file__).resolve().parents[1]
    root = site.parent

    # Prove the font covers every string before drawing anything: a missing
    # glyph must be an error at the top, not a hole discovered by whoever the
    # link is sent to.
    strings = (
        WORDMARK,
        DOMAIN,
        STRAPLINE,
        STRAPLINE_EN,
        COVER_NAV,
        COVER_HEAD,
        COVER_SOURCE,
        *(line for _, _, headline, source in CARDS for line in (headline, source)),
    )
    missing = sorted({ch for s in strings for ch in s if ch not in FONT})
    if missing:
        sys.exit(f"missing glyphs: {missing}")

    cards = [
        (name, build_card(strapline, headline, source))
        for name, strapline, headline, source in CARDS
    ]
    card = cards[0][1]

    # Both lines are set from the left margin and neither wraps — `Canvas.text`
    # blits a run and nothing measures it back — so a line too long for the
    # card is drawn straight off the right edge, on artwork no test can read
    # and every recipient can see.
    for (name, _, headline, source), (_, drawn) in zip(CARDS, cards):
        for line, scale in ((headline, HEAD_SCALE), (source, SUB_SCALE)):
            over = drawn.width_of(line, scale) - (W - 2 * MARGIN)
            if over > 0:
                sys.exit(f"{name}: {line!r} overflows the card's margins by {over}px")

    # The wordmark and the domain share a baseline and are set from opposite
    # margins, so a longer name or a longer host is what closes the gap
    # between them. 40px is the narrowest that still reads as two elements.
    gap = (RIGHT - card.width_of(DOMAIN, SUB_SCALE)) - (260 + card.width_of(WORDMARK, WM_SCALE))
    if gap < 40:
        sys.exit(f"the wordmark and the domain are {gap}px apart on the same line")
    for strapline in (STRAPLINE, STRAPLINE_EN):
        if 264 + card.width_of(strapline, SUB_SCALE) > RIGHT:
            sys.exit(f"the strapline overflows the right margin: {strapline}")

    # The cover's own margin check, and it is the one that matters most: a line
    # wider than the safe band is not clipped by the file, it is clipped by
    # Facebook on every phone, after the image is uploaded and looks right on
    # the desktop it was uploaded from.
    cover = build_cover()
    safe = COVER_SAFE[1] - COVER_SAFE[0]
    for line, scale in (
        (COVER_NAV, SUB_SCALE),
        (COVER_HEAD, HEAD_SCALE),
        (COVER_SOURCE, SUB_SCALE),
    ):
        over = cover.width_of(line, scale) - safe
        if over > 0:
            sys.exit(f"cover: {line!r} runs {over}px past what a phone shows of it")

    targets = [(site / "public" / name, drawn) for name, drawn in cards] + [
        (site / "public" / "icon-180.png", build_icon(180)),
        (site / "public" / "icon-192.png", build_icon(192)),
        (site / "public" / "icon-512.png", build_icon(512)),
        (root / "docs" / "img" / "banner.bg.png", build_banner(STRAPLINE)),
        (root / "docs" / "img" / "banner.en.png", build_banner(STRAPLINE_EN)),
        (root / "docs" / "img" / "facebook-cover.png", cover),
    ]
    favicon = site / "public" / "favicon.ico"
    favicon.write_bytes(ico((16, 32, 48)))
    print(f"wrote {favicon.relative_to(root)} ({favicon.stat().st_size} bytes, 16/32/48)")
    for out, canvas in targets:
        out.write_bytes(canvas.to_png())
        print(f"wrote {out.relative_to(root)} ({out.stat().st_size} bytes, {canvas.w}×{canvas.h})")
    print(f"  wordmark  {WORDMARK}  ({card.width_of(WORDMARK, WM_SCALE)} px wide)")
    print(f"  domain    {DOMAIN}  ({card.width_of(DOMAIN, SUB_SCALE)} px wide)")
    for name, _, headline, _ in CARDS:
        print(
            f"  {name:18} {headline}  ({card.width_of(headline, HEAD_SCALE)} of {W - 2 * MARGIN} px)"
        )


if __name__ == "__main__":
    main()
