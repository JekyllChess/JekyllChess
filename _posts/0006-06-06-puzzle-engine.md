---
layout: post
title:  Puzzle engine
FEN: r2qk2r/pb1p1pp1/2p4p/4p3/3bP3/2N5/PPP2PPP/R1BQR1K1 w kq - 0 14
---

Lorem ipsum dolor sit amet, 7. Nc4 Be7 8. Nce5 O-O 9. Be2 cxd4 10. Qxd4 Qxd4 consectetur adipiscing elit. Donec enim mi, cursus aliquet pharetra sit amet, facilisis vel orci. Duis eget consectetur neque, et vestibulum tortor. Sed a lacus euismod, sagittis mi ut, bibendum turpis.

Today's Puzzles

<puzzle>
FEN: r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 3
Moves: Nxe5 Nxe5 Bxf7+ Ke7
</puzzle>

Some more text...

<puzzle>
FEN: 8/8/8/8/8/8/7K/7k w - - 0 1
Moves: Kh3 Kg1 Kg3
</puzzle>

**figurine.js** replaces piece letters in chess notation (like K, Q, R, B, N) with their figurine Unicode symbols (♔♕♖♗♘) in all visible text on the page. It scans all text nodes in the document for Standard Algebraic Notation (SAN) patterns and replaces the letters with the matching chess figurine.

**fen.js** converts custom `<fen>` HTML tags into visual chess diagrams. Detects `<fen>` tags and turns them into boards rendered with the **chessboard.js** library. You can type `[D]` in PGN comments to insert diagrams, and use the frontmatter `FEN:` to use a diagram as a post image on the homepage.

**pgn.js** is a simple PGN → HTML renderer. It turns a `<pgn>` element containing raw PGN text into a visually formatted chess blog post layout. Fully parses movetext including move numbers, variations, and comments using **chess.js**. Translates Numeric Annotation Glyphs (NAGs) to unicode like ⟳ or ⇆. Converts `+/=` to ⩲, and `=/∞` renders as ⯹ in PGN comments.