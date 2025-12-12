---
layout: post
title:  Puzzle engine
FEN: r7/4b1kp/q2p1ppN/1pnP2n1/2p1PQ2/2P3Nb/1PB3P1/2B2RK1 w - - 0 1
---

Lorem ipsum dolor sit amet, 7. Nc4 Be7 8. Nce5 O-O 9. Be2 cxd4 10. Qxd4 Qxd4 consectetur adipiscing elit. Donec enim mi, cursus aliquet pharetra sit amet, facilisis vel orci. Duis eget consectetur neque, et vestibulum tortor. Sed a lacus euismod, sagittis mi ut, bibendum turpis.

Single puzzle:
<puzzle>
FEN: r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 3
Moves: Nxe5 Nxe5 Bxf7+ Ke7
</puzzle>

Single puzzle with inline PGN solution:

<puzzle>
FEN: r7/4b1kp/q2p1ppN/1pnP2n1/2p1PQ2/2P3Nb/1PB3P1/2B2RK1 w - - 0 1
PGN: 1. Qh4 Bd7 2. e5 dxe5 3. Nh5+ gxh5 4. Qxg5+ fxg5 5. Rf7+ Kxh6 6. Rxh7#
</puzzle>

Multi-puzzle pack from remote PGN file:↶↷

<puzzle>
PGN: https://raw.githubusercontent.com/xinyangz/chess-tactics-pgn/refs/heads/master/tactics.pgn
</puzzle>


**figurine.js** replaces piece letters in chess notation (like K, Q, R, B, N) with their figurine Unicode symbols (♔♕♖♗♘) in all visible text on the page. It scans all text nodes in the document for Standard Algebraic Notation (SAN) patterns and replaces the letters with the matching chess figurine.

**fen.js** converts custom `<fen>` HTML tags into visual chess diagrams. Detects `<fen>` tags and turns them into boards rendered with the **chessboard.js** library. You can type `[D]` in PGN comments to insert diagrams, and use the frontmatter `FEN:` to use a diagram as a post image on the homepage.

**pgn.js** is a simple PGN → HTML renderer. It turns a `<pgn>` element containing raw PGN text into a visually formatted chess blog post layout. Fully parses movetext including move numbers, variations, and comments using **chess.js**. Translates Numeric Annotation Glyphs (NAGs) to unicode like ⟳ or ⇆. Converts `+/=` to ⩲, and `=/∞` renders as ⯹ in PGN comments.