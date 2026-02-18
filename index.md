---
layout: home
title: JekyllChess
---

### Components

**figurine.js** replaces piece letters in chess notation (like K, Q, R, B, N) with their figurine Unicode symbols (♔♕♖♗♘) in all visible text on the page. It scans all text nodes in the document for Standard Algebraic Notation (SAN) patterns and replaces the letters with the matching chess figurine.

**fen.js** converts custom `<fen>` HTML tags into visual chess diagrams. Detects `<fen>` tags and turns them into boards rendered with the **chessboard.js** library. You can type `[D]` in PGN comments to insert diagrams, and use the frontmatter `FEN:` to use a diagram as a post image on the homepage.

**pgn.js** is a simple PGN → HTML renderer. It turns a `<pgn>` element containing raw PGN text into a visually formatted **static** chess blog post layout. Fully parses movetext including move numbers, variations, and comments using **chess.js**. Translates Numeric Annotation Glyphs (NAGs) to unicode like ⟳ or ⇆. Converts `+/=` to ⩲, and `=/∞` renders as ⯹ in PGN comments.

**pgn-reader.js** is an interactive PGN viewer. It takes a `<pgn-reader>` element that contains raw PGN text and turns it into a chess game viewer. Viewer features smooth board animations, clickable moves, bold mainline, variation support, and a clean desktop/mobile layout.

**puzzle.js** and **training.js** are interactive boards that require the reader to enter moves by dragging the pieces. Puzzles work by FEN tags, or multi-puzzle packs can be loaded from remote PGN files. Training works just like the pgn-reader, except that the PGN content is gradually printed on screen as the user finds the correct moves on the board.
